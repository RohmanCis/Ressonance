import { randomUUID } from "node:crypto";

import type { GuestSession } from "@/lib/guest-session";
import {
  photoExtension,
  type PhotoFileConfig,
  type PhotoMimeType,
  validatePhotoFile,
} from "@/lib/photo-file";
import type { PhotoStorage } from "@/lib/photo-storage";
import type { PhotoTxRepo } from "@/lib/photo-tx-repo";
import { resolveGuestSession, type SessionByTokenRepo } from "@/lib/resolve-guest-session";

/**
 * POST /api/events/{public_id}/photos orchestration (T006).
 *
 * Auth resolution (`resolvePhotoAuth`) is split from submission (`submitPhoto`)
 * so the route can authenticate/authorize the event and guest session BEFORE
 * parsing the multipart body (QA-2). `submitPhoto` validates bytes and runs the
 * authoritative transaction (lock → revalidate ACTIVE → count → upload →
 * insert → commit) with compensation on failure. Rate limiting is applied by
 * the route after auth and before body parsing (QA-3).
 */

export const PHOTO_LIMIT = 5;

export interface PhotoSession
  extends SessionByTokenRepo {
  findEventByPublicId(publicId: string): Promise<{ id: string; status: string } | null>;
}

export type PhotoAuthResult =
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
 * before `request.formData()` so unauthenticated requests never parse multipart.
 */
export async function resolvePhotoAuth(
  sessionRepo: PhotoSession,
  input: { publicId: string; cookieValue: string | undefined },
): Promise<PhotoAuthResult> {
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
  type: "PHOTO";
  created_at: string;
  mime_type: PhotoMimeType;
  file_size: number;
}

export interface PhotoUsage {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

export type SubmitPhotoResult =
  | { kind: "invalid_request" }
  | { kind: "event_closed" }
  | { kind: "unsupported_media" }
  | { kind: "file_too_large" }
  | { kind: "photo_limit_reached" }
  | { kind: "media_persistence_failed" }
  | { kind: "ok"; submission: Submission; usage: PhotoUsage };

export interface SubmitPhotoDeps {
  sessionRepo: PhotoSession;
  txRepo: PhotoTxRepo;
  storage: PhotoStorage;
  config: PhotoFileConfig;
}

export interface SubmitPhotoInput {
  event: { id: string; status: string };
  session: GuestSession;
  data: Uint8Array;
}

/** Opaque storage key; never a user filename or DB PK (TECHNICAL_DESIGN §6). */
export function generatePhotoStorageKey(
  eventId: string,
  sessionId: string,
  mime: PhotoMimeType,
): string {
  return `events/${eventId}/sessions/${sessionId}/photos/${randomUUID()}.${photoExtension(mime)}`;
}

/**
 * Best-effort object deletion. Never rethrows into a success path; a cleanup
 * failure is logged as a structured entry for operational reconciliation (TD §6).
 */
async function tryDelete(storage: PhotoStorage, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "photo_cleanup_failed",
        storageKey: key,
        error: String(err),
      }),
    );
  }
}

/** Roll back the transaction and compensate the just-written object. */
async function compensate(
  tx: { rollback(): Promise<void> },
  storage: PhotoStorage,
  key: string,
): Promise<void> {
  await tx.rollback();
  await tryDelete(storage, key);
}

export async function submitPhoto(
  deps: SubmitPhotoDeps,
  input: SubmitPhotoInput,
): Promise<SubmitPhotoResult> {
  const validation = validatePhotoFile(input.data, deps.config);
  if (validation.status === "empty") return { kind: "invalid_request" };
  if (validation.status === "too_large") return { kind: "file_too_large" };
  if (validation.status === "unsupported") return { kind: "unsupported_media" };

  // BEGIN + per-session row lock + coordinated event-row lock (revalidate ACTIVE
  // atomically) + count. Any DB failure here is a persistence failure (QA-2 #3).
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

  if (tx.count >= PHOTO_LIMIT) {
    await tx.rollback();
    return { kind: "photo_limit_reached" };
  }

  const key = generatePhotoStorageKey(input.event.id, input.session.id, validation.mime);

  try {
    await deps.storage.upload(key, input.data, validation.mime);
  } catch {
    // The object may have been partially created; compensate it (QA-1 #4).
    await tx.rollback();
    await tryDelete(deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  let media: { id: string; created_at: string };
  try {
    media = await tx.insertPhoto({
      sessionId: input.session.id,
      storageKey: key,
      fileSize: input.data.length,
      mimeType: validation.mime,
    });
  } catch {
    await compensate(tx, deps.storage, key);
    return { kind: "media_persistence_failed" };
  }

  // Read actual voice-note state for the usage shape (QA-1 #5).
  let voiceCount: number;
  try {
    voiceCount = await tx.countVoiceNotes(input.session.id);
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

  const photosSubmitted = tx.count + 1;
  return {
    kind: "ok",
    submission: {
      id: media.id,
      type: "PHOTO",
      created_at: media.created_at,
      mime_type: validation.mime,
      file_size: input.data.length,
    },
    usage: {
      photos_submitted: photosSubmitted,
      photos_remaining: Math.max(0, PHOTO_LIMIT - photosSubmitted),
      voice_note_submitted: voiceCount > 0,
      voice_note_available: voiceCount === 0,
    },
  };
}