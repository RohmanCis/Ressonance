import {
  type GuestSession,
  hashSessionToken,
  isValidSessionToken,
  sessionBelongsToEvent,
} from "@/lib/guest-session";

/**
 * Reusable guest-session resolution from an HttpOnly cookie (T005).
 *
 * Pure and testable: the database lookup is injected. Used by every protected
 * guest endpoint (usage, photo, voice-note) to turn the presented cookie into
 * a session that provably belongs to the target event and has not expired
 * (checked against `expires_at`).
 */

export interface SessionByTokenRepo {
  findSessionByTokenHash(hash: string): Promise<GuestSession | null>;
}

export type ResolveResult =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "not_found" }
  | { kind: "wrong_event" }
  | { kind: "session_expired" }
  | { kind: "ok"; session: GuestSession };

/**
 * Resolve a raw cookie value to a session for `eventId`. Always hashes before
 * touching the DB; never trusts the raw token or a client-supplied event id.
 */
export async function resolveGuestSession(
  repo: SessionByTokenRepo,
  cookieValue: string | undefined,
  eventId: string,
): Promise<ResolveResult> {
  if (!cookieValue) return { kind: "missing" };
  if (!isValidSessionToken(cookieValue)) return { kind: "invalid" };

  const session = await repo.findSessionByTokenHash(hashSessionToken(cookieValue));
  if (!session) return { kind: "not_found" };
  if (!sessionBelongsToEvent(session, eventId)) return { kind: "wrong_event" };

  if (new Date(session.expires_at) <= new Date()) {
    return { kind: "session_expired" };
  }

  return { kind: "ok", session };
}