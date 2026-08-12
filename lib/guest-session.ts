import { createHash, randomBytes } from "node:crypto";

/**
 * GuestSession identity foundation (T003).
 *
 * Scope: token generation, SHA-256 digest storage/lookup height, HttpOnly
 * cookie construction, and event/session ownership. No `expires_at`, no
 * timeout logic, no cookie `Max-Age`/`Expires` policy — session expiry is an
 * open technical decision (see docs/TECHNICAL_DESIGN.md §5, §15).
 */

export const GUEST_SESSION_COOKIE = "__Host-guest_session";

/** Raw opaque high-entropy credential, never stored in plaintext. */
export function generateSessionToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Stable SHA-256 digest of the raw token. This is the value stored in and
 * looked up against `guest_sessions.session_token` (ADR-004).
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Reject malformed/absent cookie credentials before hashing or hitting the
 * database. The raw token is base64url (no padding), at least 16 chars.
 */
export function isValidSessionToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= 16 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export interface GuestSessionCookieOptions {
  /** `Secure` flag. Defaults to production; pass `false` for local HTTP. */
  secure?: boolean;
}

/**
 * Build the Set-Cookie value for the guest-session credential.
 *
 * Attributes: `__Host-guest_session`, HttpOnly, SameSite=Lax, Path=/,
 * host-only (no Domain), Secure in production. Deliberately no `Max-Age` and
 * no `Expires` — expiry policy is an open decision.
 */
export function buildGuestSessionCookie(
  token: string,
  options: GuestSessionCookieOptions = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const parts = [
    `${GUEST_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build a Set-Cookie value that clears the guest-session credential.
 *
 * Used by protected guest endpoints when a presented session is invalid or
 * no longer valid (API Contract §3). `Max-Age=0` is only the standard cookie
 * deletion mechanism — it is not session-expiry policy (still open).
 */
export function clearGuestSessionCookie(
  options: GuestSessionCookieOptions = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const parts = [
    `${GUEST_SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Minimal GuestSession shape used for ownership checks. */
export interface GuestSession {
  id: string;
  event_id: string;
  session_token: string;
  guest_name: string | null;
}

/**
 * A cookie alone never grants access to another event (API Contract §3).
 * The session must belong to the event being acted on.
 */
export function sessionBelongsToEvent(
  session: GuestSession,
  eventId: string,
): boolean {
  return session.event_id === eventId;
}