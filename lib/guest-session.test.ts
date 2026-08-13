import { describe, expect, it } from "vitest";

import {
  GUEST_SESSION_COOKIE,
  buildGuestSessionCookie,
  generateSessionToken,
  hashSessionToken,
  isValidSessionToken,
  sessionBelongsToEvent,
  type GuestSession,
} from "@/lib/guest-session";

describe("generateSessionToken", () => {
  it("produces high-entropy base64url tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(isValidSessionToken(a)).toBe(true);
  });
});

describe("hashSessionToken", () => {
  it("is a 64-char sha256 hex digest", () => {
    const digest = hashSessionToken("raw-token-value");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and one-way", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});

describe("isValidSessionToken", () => {
  it("rejects malformed and absent credentials", () => {
    expect(isValidSessionToken(undefined)).toBe(false);
    expect(isValidSessionToken(null)).toBe(false);
    expect(isValidSessionToken(123)).toBe(false);
    expect(isValidSessionToken("")).toBe(false);
    expect(isValidSessionToken("short")).toBe(false);
    expect(isValidSessionToken("has invalid chars!")).toBe(false);
  });

  it("accepts a valid generated token", () => {
    expect(isValidSessionToken(generateSessionToken())).toBe(true);
  });
});

describe("buildGuestSessionCookie", () => {
  it("sets HttpOnly, SameSite=Lax, Path=/, Max-Age=1800, no Expires", () => {
    const cookie = buildGuestSessionCookie("token", { secure: false });
    const lower = cookie.toLowerCase();
    expect(cookie.startsWith(`${GUEST_SESSION_COOKIE}=token`)).toBe(true);
    expect(lower).toContain("httponly");
    expect(lower).toContain("samesite=lax");
    expect(lower).toContain("path=/");
    expect(lower).toContain("max-age=1800");
    expect(lower).not.toContain("expires=");
    expect(lower).not.toContain("domain=");
  });

  it("adds Secure only when requested", () => {
    expect(buildGuestSessionCookie("t", { secure: true })).toContain("Secure");
    expect(buildGuestSessionCookie("t", { secure: false })).not.toContain(
      "Secure",
    );
  });
});

describe("sessionBelongsToEvent", () => {
  const session: GuestSession = {
    id: "s1",
    event_id: "e1",
    session_token: hashSessionToken("token"),
    guest_name: null,
    expires_at: "2099-01-01T00:00:00Z",
  };

  it("accepts a session for its own event", () => {
    expect(sessionBelongsToEvent(session, "e1")).toBe(true);
  });

  it("rejects a session for another event", () => {
    expect(sessionBelongsToEvent(session, "e2")).toBe(false);
  });
});