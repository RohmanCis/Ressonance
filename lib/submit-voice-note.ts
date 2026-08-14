import { randomUUID } from "node:crypto";

import { logApiError } from "@/lib/api-log";
import type { AudioInspector } from "@/lib/audio-inspector";
import {
  ffprobeFormatToMime,
  type VoiceNoteFileConfig,
  type VoiceNoteMimeType,
  validateVoiceNoteFile,
  VOICE_DURATION_MAX,
  VOICE_DURATION_MIN,
  voiceNoteExtension,
} from "@/lib/audio-file";
import type { GuestSession } from "@/lib/guest-session";
import { resolveGuestSession, type SessionByTokenRepo } from "@/lib/resolve-guest-session";
import { PHOTO_LIMIT } from "@/lib/submit-photo";
import type { VoiceNoteStorage } from "@/lib/voice-note-storage";
import {
  type VoiceNoteTxRepo,
  VoiceNoteUniqueViolationError,
} from "@/lib/voice-note-tx-repo";

/**
 * POST /api/events/{public_id}/voice-notes orchestration (T007).
 *
 * Auth resolution (`resolveVoiceNoteAuth`) is split from submission
 * (`submitVoiceNote`) so the route can authenticate/authorize the event and
 * guest session BEFORE parsing the multipart body (QA-2). `submitVoiceNote`
 * validates bytes, runs `ffprobe` for format + duration (ADR-006), then runs
 * the authoritative transaction (event-row lock → revalidate ACTIVE →
 * upload → insert → commit) with compensation on failure. The
 * `UNIQUE(guest_session_id)` constraint is the race-safe guard; no per-session
 * row lock is taken (TD §9). Rate limiting is applied by the route after auth
 * and before body parsing (QA-3).
 */

export interface VoiceNoteSession extends SessionByTokenRepo {
  findEventByPublicId(publicId: string): Promise<{ id: string; status: string } | null>;
}

export type VoiceNoteAuthResult =
  | { kind: "not_found" }
  | { kind: "event_closed" }
  | { kind: "session_required" }
  | { kind: "session_invalid" }
  | { kind: "session_expired" }
  | { kind: "ok"; event: { id: string; status: string }; session: GuestSession };

/**
 * Resolve and authorize the event + guest session without touching the body.
 * Unknown event → not_found; non-ACTIVE → event_closed; missing/invalid/unknown
 * or wrong-event cookie → session_required/session_invalid. The route calls this
 * before parsing multipart so unauthenticated requests never read the body.
 */
export async function resolveVoiceNoteAuth(
  sessionRepo: VoiceNoteSession,
  input: { publicId: string; cookieValue: string | undefined },
): Promise<VoiceNoteAuthResult> {
  const event = await sessionRepo.findEventByPublicId(input.publicId);
  if (!event) return { kind: "not_found" };
  if (event.status !== "ACTIVE") return { kind: "event_closed" };

  const resolved = await resolveGuestSession(
    sessionRepo,
    input.cookieValue,
    event.id,
  );
  switch (resolved.kind) {
    case "missing":
      return { kind: "session_required" };
    case "invalid":
    case "not_found":
    case "wrong_event":
      return { kind: "session_invalid" };
    case "session_expired":
      return { kind: "session_expired" };
    case "ok":
      return { kind: "ok", event, session: resolved.session };
  }
}

export interface Submission {
  id: string;
  type: "VOICE_NOTE";
  created_at: string;
  mime_type: VoiceNoteMimeType;
  file_size: number;
  duration_seconds: number;
}

export interface VoiceNoteUsage {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

export type SubmitVoiceNoteResult =
  | { kind: "invalid_request" }
  | { kind: "event_closed" }
  | { kind: "unsupported_media" }
  | { kind: "file_too_large" }
  | { kind: "audio_duration_invalid" }
  | { kind: "audio_uninspectable" }
  | { kind: "voice_note_limit_reached" }
  | { kind: "media_persistence_failed" }
  | { kind: "ok"; submission: Submission; usage: VoiceNoteUsage };

export interface SubmitVoiceNoteDeps {
  sessionRepo: VoiceNoteSession;
  txRepo: VoiceNoteTxRepo;
  storage: VoiceNoteStorage;
  inspector: AudioInspector;
  config: VoiceNoteFileConfig;
}

export interface SubmitVoiceNoteInput {
  event: { id: string; status: string };
  session: GuestSession;
  data: Uint8Array;
}

/** Opaque storage key; never a user filename or DB PK (TECHNICAL_DESIGN §6). */
export function generateVoiceNoteStorageKey(
  eventId: string,
  sessionId: string,
  mime: VoiceNoteMimeType,
): string {
  return `events/${eventId}/sessions/${sessionId}/voice-notes/${randomUUID()}.${voiceNoteExtension(mime)}`;
}

/**
 * Best-effort object deletion. Never rethrows into a success path; a cleanup
 * failure is logged as a structured entry for operational reconciliation (TD §6).
 */
async function tryDelete(storage: VoiceNoteStorage, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (err) {
    logApiError({
      event: "voice_note_cleanup_failed",
      error: err,
      context: { storageKey: key },
    });
  }
}

/** Roll back the transaction and compensate the just-written object. */
async function compensate(
  tx: { rollback(): Promise<void> },
  storage: VoiceNoteStorage,
  key: string,
): Promise<void> {
  await tx.rollback();
  await tryDelete(storage, key);
}

export async function submitVoiceNote(
  deps: SubmitVoiceNoteDeps,
  input: SubmitVoiceNoteInput,
): Promise<SubmitVoiceNoteResult> {
  const validation = validateVoiceNoteFile(input.data, deps.config);
  if (validation.status === "empty") return { kind: "invalid_request" };
  if (validation.status === "too_large") return { kind: "file_too_large" };

  // ffprobe is the authority for BOTH format approval and duration (ADR-006).
  const inspection = await deps.inspector.inspect(input.data);
  if (inspection.status === "uninspectable") return { kind: "audio_uninspectable" };

  const mime = ffprobeFormatToMime(inspection.formatName);
  if (!mime) return { kind: "unsupported_media" };

  // Validate the FLOAT duration in [5,30] before rounding for storage.
  if (
    inspection.durationSeconds < VOICE_DURATION_MIN ||
    inspection.durationSeconds > VOICE_DURATION_MAX
  ) {
    return { kind: "audio_duration_invalid" };
  }
  const durationSeconds = Math.round(inspection.durationSeconds);

  // BEGIN + event-row lock (revalidate ACTIVE atomically). No per-session
  // voice-note lock — the unique constraint is the guard (TD §9).
  let tx;
  try {
    tx = await deps.txRepo.begin(input.session.id, input.event.id);
  } catch {
    return { kind: "media_persistence_failed" };
  }

  // ACTIVE re-read under the event-row lock: a concurrent close is rejected.
  if (tx.eventStatus !== "ACTIVE") {
    await tx.rollback();
    return { kind: "event_closed" };
  }

  const key = generateVoiceNoteStorageKey(input.event.id, input.session.id, mime);

  try {
    await deps.storage.upload(key, input.data, mime);
  } catch {
    // The object may have been partially created; compensate it (QA-1 #4).
    await tx.rollback();
    await tryDelete(deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  let media: { id: string; created_at: string };
  try {
    media = await tx.insertVoiceNote({
      sessionId: input.session.id,
      storageKey: key,
      fileSize: input.data.length,
      mimeType: mime,
      durationSeconds,
    });
  } catch (err) {
    if (err instanceof VoiceNoteUniqueViolationError) {
      // The losing concurrent request: delete the object written for it and
      // map the raw SQL error to the business rule (TD §9).
      await compensate(tx, deps.storage, key);
      return { kind: "voice_note_limit_reached" };
    }
    await compensate(tx, deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  // Count photos for the session for the usage shape (QA-1 #5).
  let photoCount: number;
  try {
    photoCount = await tx.countPhotos(input.session.id);
  } catch {
    await compensate(tx, deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  try {
    await tx.commit();
  } catch {
    await compensate(tx, deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  return {
    kind: "ok",
    submission: {
      id: media.id,
      type: "VOICE_NOTE",
      created_at: media.created_at,
      mime_type: mime,
      file_size: input.data.length,
      duration_seconds: durationSeconds,
    },
    usage: {
      photos_submitted: photoCount,
      photos_remaining: Math.max(0, PHOTO_LIMIT - photoCount),
      voice_note_submitted: true,
      voice_note_available: false,
    },
  };
}