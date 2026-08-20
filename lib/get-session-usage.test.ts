import { describe, expect, it } from "vitest";

import { type GuestSession, hashSessionToken } from "@/lib/guest-session";
import {
  getSessionUsage,
  type UsageEvent,
  type UsageRepo,
} from "@/lib/get-session-usage";

const ACTIVE: UsageEvent = {
  id: "e1",
  public_id: "evt-active",
  title: "Summer Party",
  status: "ACTIVE",
};
const CLOSED: UsageEvent = {
  id: "e2",
  public_id: "evt-closed",
  title: "Old Party",
  status: "CLOSED",
};

const TOKEN = "valid-token-12345678";

function session(overrides: Partial<GuestSession> = {}): GuestSession {
  return {
    id: "s1",
    event_id: "e1",
    session_token: hashSessionToken(TOKEN),
    guest_name: "Fante",
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function repo(overrides: Partial<UsageRepo> = {}): UsageRepo {
  return {
    async findEventByPublicId(pid) {
      return [ACTIVE, CLOSED].find((e) => e.public_id === pid) ?? null;
    },
    async findSessionByTokenHash(hash) {
      const s = session();
      return s.session_token === hash ? s : null;
    },
    async countPhotos() {
      return 2;
    },
    async countVoiceNotes() {
      return 0;
    },
    ...overrides,
  };
}

describe("getSessionUsage", () => {
  it("returns not_found for an unknown event", async () => {
    const r = await getSessionUsage(repo(), {
      publicId: "evt-missing",
      cookieValue: TOKEN,
    });
    expect(r.kind).toBe("not_found");
  });

  it("returns session_required when no cookie is presented", async () => {
    const r = await getSessionUsage(repo(), {
      publicId: "evt-active",
      cookieValue: undefined,
    });
    expect(r.kind).toBe("session_required");
  });

  it("returns session_invalid for a mismatched event", async () => {
    const r = await getSessionUsage(repo(), {
      publicId: "evt-closed",
      cookieValue: TOKEN,
    });
    expect(r.kind).toBe("session_invalid");
  });

  it("returns session_invalid for an unknown token", async () => {
    const r = await getSessionUsage(repo(), {
      publicId: "evt-active",
      cookieValue: "unknown-token-123456",
    });
    expect(r.kind).toBe("session_invalid");
  });

  it("returns the usage shape with counts and event status", async () => {
    const r = await getSessionUsage(repo(), {
      publicId: "evt-active",
      cookieValue: TOKEN,
    });
    expect(r).toEqual({
      kind: "ok",
      body: {
        event: { public_id: "evt-active", title: "Summer Party", status: "ACTIVE" },
        guest_name: "Fante",
        photos_submitted: 2,
        photos_remaining: 3,
        voice_note_submitted: false,
        voice_note_available: true,
      },
    });
  });

  it("keeps CLOSED events readable and reports voice-note state", async () => {
    const closedSession = session({ id: "s2", event_id: "e2" });
    const r = await getSessionUsage(
      repo({
        async findSessionByTokenHash(hash) {
          return closedSession.session_token === hash ? closedSession : null;
        },
        async countVoiceNotes() {
          return 1;
        },
      }),
      { publicId: "evt-closed", cookieValue: TOKEN },
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.body.event.status).toBe("CLOSED");
      expect(r.body.voice_note_submitted).toBe(true);
      expect(r.body.voice_note_available).toBe(false);
      expect(r.body.guest_name).toBe("Fante");
    }
  });

  it("returns session_expired for an expired session", async () => {
    const r = await getSessionUsage(
      repo({
        async findSessionByTokenHash(hash) {
          const s = session({ expires_at: new Date(Date.now() - 60000).toISOString() });
          return s.session_token === hash ? s : null;
        },
      }),
      { publicId: "evt-active", cookieValue: TOKEN },
    );
    expect(r.kind).toBe("session_expired");
  });
});