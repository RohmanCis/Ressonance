import type { GuestSession } from "@/lib/guest-session";
import { PHOTO_LIMIT } from "@/lib/submit-photo";
import {
  type GuestMessageTxRepo,
  GuestMessageUniqueViolationError,
} from "@/lib/guest-message-tx-repo";

/**
 * POST /api/events/{public_id}/guest-messages orchestration (guest message
 * feature, Opsi B; API Contract §6.6).
 *
 * Auth resolution is shared across all guest submissions via
 * `resolveGuestSubmissionAuth` (lib/guest-submission-auth.ts), called by the
 * shared route pipeline BEFORE reading the JSON body (unknown event → 404,
 * non-ACTIVE → 422 EVENT_CLOSED, missing/invalid/wrong-event/expired cookie →
 * 401). It is deliberately NOT duplicated here.
 *
 * `submitGuestMessage` validates the trimmed text (1–280 chars), then runs the
 * authoritative transaction (event-row lock → revalidate ACTIVE → insert →
 * usage counts → commit). `UNIQUE(guest_session_id)` is the race-safe guard;
 * no per-session row lock is taken (TECHNICAL_DESIGN §9 pattern). There is no
 * object storage, so there is no compensation step.
 */

export const GUEST_MESSAGE_MAX_LENGTH = 280;

export interface GuestMessageSubmission {
  id: string;
  type: "GUEST_MESSAGE";
  created_at: string;
  message_text: string;
}

export interface GuestMessageUsage {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
  guest_message_submitted: boolean;
  guest_message_available: boolean;
}

export type SubmitGuestMessageResult =
  | { kind: "invalid_input"; fields: { message_text: string } }
  | { kind: "event_closed" }
  | { kind: "guest_message_limit_reached" }
  | { kind: "persistence_failed" }
  | { kind: "ok"; submission: GuestMessageSubmission; usage: GuestMessageUsage };

export interface SubmitGuestMessageDeps {
  txRepo: GuestMessageTxRepo;
}

export interface SubmitGuestMessageInput {
  event: { id: string; status: string };
  session: GuestSession;
  /** Raw `message_text` value from the JSON body. */
  messageText: unknown;
}

/**
 * Normalize + validate `message_text`: must be present, a string, and
 * 1–280 characters after trim. Returns the trimmed text or the field error.
 */
export function validateGuestMessageText(
  value: unknown,
): { ok: true; text: string } | { ok: false; field: string } {
  if (typeof value !== "string") {
    return { ok: false, field: "Message is required." };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, field: "Message cannot be empty." };
  }
  if (trimmed.length > GUEST_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      field: `Message must be ${GUEST_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, text: trimmed };
}

export async function submitGuestMessage(
  deps: SubmitGuestMessageDeps,
  input: SubmitGuestMessageInput,
): Promise<SubmitGuestMessageResult> {
  const validation = validateGuestMessageText(input.messageText);
  if (!validation.ok) {
    return { kind: "invalid_input", fields: { message_text: validation.field } };
  }

  // BEGIN + event-row lock (revalidate ACTIVE atomically). No per-session
  // message lock — the unique constraint is the guard (TD §9 pattern).
  let tx;
  try {
    tx = await deps.txRepo.begin(input.session.id, input.event.id);
  } catch {
    return { kind: "persistence_failed" };
  }

  // ACTIVE re-read under the event-row lock: a concurrent close is rejected.
  if (tx.eventStatus !== "ACTIVE") {
    await tx.rollback();
    return { kind: "event_closed" };
  }

  let media: { id: string; created_at: string };
  try {
    media = await tx.insertGuestMessage({
      sessionId: input.session.id,
      messageText: validation.text,
    });
  } catch (err) {
    if (err instanceof GuestMessageUniqueViolationError) {
      // The losing concurrent request: map the raw SQL error to the business
      // rule (TD §9 pattern). No storage object to compensate.
      await tx.rollback();
      return { kind: "guest_message_limit_reached" };
    }
    await tx.rollback();
    return { kind: "persistence_failed" };
  }

  // Photo count + voice-note existence for the usage shape.
  let photoCount: number;
  let hasVoiceNote: boolean;
  try {
    [photoCount, hasVoiceNote] = await Promise.all([
      tx.countPhotos(input.session.id),
      tx.voiceNoteExists(input.session.id),
    ]);
  } catch {
    await tx.rollback();
    return { kind: "persistence_failed" };
  }

  try {
    await tx.commit();
  } catch {
    await tx.rollback();
    return { kind: "persistence_failed" };
  }

  return {
    kind: "ok",
    submission: {
      id: media.id,
      type: "GUEST_MESSAGE",
      created_at: media.created_at,
      message_text: validation.text,
    },
    usage: {
      photos_submitted: photoCount,
      photos_remaining: Math.max(0, PHOTO_LIMIT - photoCount),
      voice_note_submitted: hasVoiceNote,
      voice_note_available: !hasVoiceNote,
      guest_message_submitted: true,
      guest_message_available: false,
    },
  };
}
