import { describe, expect, it } from "vitest";

import {
  type GuestSession,
  hashSessionToken,
} from "@/lib/guest-session";
import {
  resolveGuestSession,
  type SessionByTokenRepo,
} from "@/lib/resolve-guest-session";

const TOKEN = "valid-token-12345678";

function session(overrides: Partial<GuestSession> = {}): GuestSession {
  return {
    id: "s1",
    event_id: "e1",
    session_token: hashSessionToken(TOKEN),
    guest_name: null,
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function repo(sessions: GuestSession[]): SessionByTokenRepo {
  return {
    async findSessionByTokenHash(hash) {
      return sessions.find((s) => s.session_token === hash) ?? null;
    },
  };
}

describe("resolveGuestSession", () => {
  it("returns missing for an absent cookie", async () => {
    const r = await resolveGuestSession(repo([session()]), undefined, "e1");
    expect(r.kind).toBe("missing");
  });

  it("returns invalid for a malformed token (no DB hit)", async () => {
    const r = await resolveGuestSession(repo([]), "not-a-token!", "e1");
    expect(r.kind).toBe("invalid");
  });

  it("returns not_found for an unknown token hash", async () => {
    const r = await resolveGuestSession(repo([session()]), "unknown-token-123456", "e1");
    expect(r.kind).toBe("not_found");
  });

  it("returns wrong_event when the session belongs to another event", async () => {
    const r = await resolveGuestSession(
      repo([session({ event_id: "e2" })]),
      TOKEN,
      "e1",
    );
    expect(r.kind).toBe("wrong_event");
  });

  it("returns ok with the session for a matching event", async () => {
    const r = await resolveGuestSession(repo([session()]), TOKEN, "e1");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.session.id).toBe("s1");
  });

  it("returns session_expired for an expired session", async () => {
    const expired = session({ expires_at: new Date(Date.now() - 60000).toISOString() });
    const r = await resolveGuestSession(repo([expired]), TOKEN, "e1");
    expect(r.kind).toBe("session_expired");
  });

  it("returns ok for a session that has not expired", async () => {
    const valid = session({ expires_at: new Date(Date.now() + 60000).toISOString() });
    const r = await resolveGuestSession(repo([valid]), TOKEN, "e1");
    expect(r.kind).toBe("ok");
  });
});