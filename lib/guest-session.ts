import { createHash, randomBytes } from "node:crypto";

/**
 * GuestSession identity foundation (T003).
 *
 * Scope: token generation, SHA-256 digest storage/lookup height, HttpOnly
 * cookie construction, and event/session ownership. Session expiry is enforced
 * server-side via the `expires_at` column (30-min lifetime); the cookie
 * `Max-Age=1800` matches that lifetime (see docs/TECHNICAL_DESIGN.md §5, §15).
 */

export const GUEST_SESSION_COOKIE = "__Host-guest_session";

/** Server-side GuestSession lifetime must match cookie Max-Age (T026). */
export const GUEST_SESSION_MAX_AGE_SECONDS = 1800;

/** Raw opaque high-entropy credential, never stored in plaintext. */
export function generateSessionToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Opaque, non-credential grouping identifier for a GuestSession (API Contract
 * §4 Submission). Separate from the DB PK (`id`) and the credential
 * (`session_token`); exposed in admin submission listings so media can be
 * grouped by GuestSession without leaking the PK or credential. Mirrors the
 * `events.public_id` / `events.id` split.
 */
export function generateGuestSessionPublicRef(bytes = 16): string {
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
  /** `Secure` flag. Always on by default: the `__Host-` prefix mandates it
   * (RFC 6265bis). Browsers treat localhost as a secure context, so this
   * works in local dev over HTTP too. Pass `false` only for unit tests. */
  secure?: boolean;
}

/**
 * Build the Set-Cookie value for the guest-session credential.
 *
 * Attributes: `__Host-guest_session`, HttpOnly, SameSite=Lax, Path=/,
 * host-only (no Domain), Secure in production. `Max-Age=1800` matches the
 * server-side `expires_at` lifetime.
 */
export function buildGuestSessionCookie(
  token: string,
  options: GuestSessionCookieOptions = {},
): string {
  const secure = options.secure ?? true;
  const parts = [
    `${GUEST_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${GUEST_SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build a Set-Cookie value that clears the guest-session credential.
 *
 * Used by protected guest endpoints when a presented session is invalid or
 * expired (API Contract §3). `Max-Age=0` is only the standard cookie
 * deletion mechanism; expiry policy itself is enforced server-side.
 */
export function clearGuestSessionCookie(
  options: GuestSessionCookieOptions = {},
): string {
  const secure = options.secure ?? true;
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
  expires_at: string;
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