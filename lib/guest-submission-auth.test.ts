import { describe, expect, it } from "vitest";

import { generateSessionToken, hashSessionToken, type GuestSession } from "@/lib/guest-session";
import {
  resolveGuestSubmissionAuth,
  type GuestSubmissionRepo,
} from "@/lib/guest-submission-auth";

/**
 * Auth resolution for guest submissions (architecture deepening #1).
 * Ported from the former resolvePhotoAuth / resolveVoiceNoteAuth suites: all
 * six branches — ok + not_found + event_closed + session_required +
 * session_invalid + session_expired — against a fake repo.
 */

interface State {
  events: Record<string, { id: string; status: string }>;
  sessions: Record<string, GuestSession>;
}

function makeRepo(state: State): GuestSubmissionRepo {
  return {
    async findEventByPublicId(pid) {
      return state.events[pid] ?? null;
    },
    async findSessionByTokenHash(hash) {
      return state.sessions[hash] ?? null;
    },
  };
}

function fresh(): { state: State; rawToken: string } {
  const token = generateSessionToken();
  const session: GuestSession = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
    expires_at: "2099-01-01T00:00:00Z",
  };
  return {
    state: {
      events: {
        "evt-active": { id: "event-1", status: "ACTIVE" },
        "evt-closed": { id: "event-2", status: "CLOSED" },
      },
      sessions: { [session.session_token]: session },
    },
    rawToken: token,
  };
}

describe("resolveGuestSubmissionAuth", () => {
  it("resolves an ACTIVE event and its session", async () => {
    const { state, rawToken } = fresh();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-active",
      cookieValue: rawToken,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.event).toEqual({ id: "event-1", status: "ACTIVE" });
    expect(result.session.id).toBe("session-1");
  });

  it("returns not_found for an unknown event", async () => {
    const { state } = fresh();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-missing",
      cookieValue: "whatever-12345678",
    });
    expect(result.kind).toBe("not_found");
  });

  it("returns event_closed for a CLOSED event", async () => {
    const { state } = fresh();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-closed",
      cookieValue: "whatever-12345678",
    });
    expect(result.kind).toBe("event_closed");
  });

  it("returns session_required when no cookie", async () => {
    const { state } = fresh();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-active",
      cookieValue: undefined,
    });
    expect(result.kind).toBe("session_required");
  });

  it("returns session_invalid for an unknown token", async () => {
    const { state } = fresh();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-active",
      cookieValue: "unknown-token-123456",
    });
    expect(result.kind).toBe("session_invalid");
  });

  it("returns session_invalid for a session of another event", async () => {
    const { state, rawToken } = fresh();
    state.sessions[Object.keys(state.sessions)[0]].event_id = "event-2";
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-active",
      cookieValue: rawToken,
    });
    expect(result.kind).toBe("session_invalid");
  });

  it("returns session_expired for an expired session", async () => {
    const { state, rawToken } = fresh();
    state.sessions[Object.keys(state.sessions)[0]].expires_at = new Date(
      Date.now() - 60000,
    ).toISOString();
    const result = await resolveGuestSubmissionAuth(makeRepo(state), {
      publicId: "evt-active",
      cookieValue: rawToken,
    });
    expect(result.kind).toBe("session_expired");
  });
});
