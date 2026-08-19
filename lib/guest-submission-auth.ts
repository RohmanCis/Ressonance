import type { GuestSession } from "@/lib/guest-session";
import { resolveGuestSession, type SessionByTokenRepo } from "@/lib/resolve-guest-session";

/**
 * Shared guest-submission auth resolution (architecture deepening #1).
 *
 * Replaces the byte-identical `resolvePhotoAuth` / `resolveVoiceNoteAuth`
 * duplicated in submit-photo.ts and submit-voice-note.ts: every protected
 * guest submission endpoint (photos, voice-notes, guest-messages) authorizes
 * the same way — unknown event → 404, non-ACTIVE event → 422 EVENT_CLOSED,
 * missing/invalid/unknown/wrong-event cookie → 401, expired → 401
 * SESSION_EXPIRED (API Contract §3, §6).
 *
 * Cross-refs: API Contract §6 (auth for all guest submissions),
 * db_scheme.md guest_sessions/events tables, TECHNICAL_DESIGN.md §4.1
 * (GuestSession credential) and §5 (expiry via `expires_at`).
 */

/** Repo shape needed to resolve auth: event by public_id + session by token hash. */
export interface GuestSubmissionRepo extends SessionByTokenRepo {
  findEventByPublicId(publicId: string): Promise<{ id: string; status: string } | null>;
}

export type GuestSubmissionAuthResult =
  | { kind: "not_found" }
  | { kind: "event_closed" }
  | { kind: "session_required" }
  | { kind: "session_invalid" }
  | { kind: "session_expired" }
  | { kind: "ok"; event: { id: string; status: string }; session: GuestSession };

/**
 * Resolve and authorize the event + guest session without touching the body.
 * Unknown event → not_found; non-ACTIVE → event_closed; missing/invalid/unknown
 * or wrong-event cookie → session_required/session_invalid; expired →
 * session_expired. Callers (the shared route pipeline) reject before any body
 * parsing so unauthenticated requests never read the request body (QA-2).
 */
export async function resolveGuestSubmissionAuth(
  repo: GuestSubmissionRepo,
  input: { publicId: string; cookieValue: string | undefined },
): Promise<GuestSubmissionAuthResult> {
  const event = await repo.findEventByPublicId(input.publicId);
  if (!event) return { kind: "not_found" };
  if (event.status !== "ACTIVE") return { kind: "event_closed" };

  const resolved = await resolveGuestSession(
    repo,
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
