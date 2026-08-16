import { describe, expect, it } from "vitest";

import { hashSessionToken } from "@/lib/guest-session";
import { startGuestSession, type SessionRepo } from "@/lib/start-guest-session";

function makeRepo(overrides: Partial<SessionRepo> = {}): {
  repo: SessionRepo;
  calls: { eventId: string; sessionTokenHash: string; publicRef: string; guestName: string | null }[];
} {
  const calls: {
    eventId: string;
    sessionTokenHash: string;
    publicRef: string;
    guestName: string | null;
  }[] = [];
  const repo: SessionRepo = {
    async findEventByPublicId(publicId) {
      return publicId === "evt-active"
        ? { id: "event-1", status: "ACTIVE" }
        : publicId === "evt-closed"
          ? { id: "event-2", status: "CLOSED" }
          : publicId === "evt-archived"
            ? { id: "event-3", status: "ARCHIVED" }
            : null;
    },
    async createGuestSession(input) {
      calls.push(input);
      return { id: "session-1" };
    },
    ...overrides,
  };
  return { repo, calls };
}

describe("startGuestSession", () => {
  it("creates a session and returns the exact success body", async () => {
    const { repo } = makeRepo();
    const result = await startGuestSession(repo, {
      publicId: "evt-active",
      guestName: "Fante",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body).toEqual({
      event_public_id: "evt-active",
      guest_name: "Fante",
      photos_submitted: 0,
      photos_remaining: 5,
      voice_note_submitted: false,
      voice_note_available: true,
      guest_message_submitted: false,
      guest_message_available: true,
    });
    expect(result.token.length).toBeGreaterThanOrEqual(16);
  });

  it("stores only the SHA-256 digest, never the raw token", async () => {
    const { repo, calls } = makeRepo();
    const result = await startGuestSession(repo, {
      publicId: "evt-active",
      guestName: "Fante",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(calls).toHaveLength(1);
    expect(calls[0].sessionTokenHash).toBe(hashSessionToken(result.token));
    expect(calls[0].sessionTokenHash).not.toBe(result.token);
    expect(calls[0].eventId).toBe("event-1");
    expect(calls[0].guestName).toBe("Fante");
    expect(calls[0].publicRef).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(calls[0].publicRef).not.toBe(result.token);
  });

  it("treats empty/absent name as anonymous (null)", async () => {
    for (const guestName of [undefined, null, "", "   "]) {
      const { repo, calls } = makeRepo();
      const result = await startGuestSession(repo, {
        publicId: "evt-active",
        guestName,
      });
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") continue;
      expect(result.body.guest_name).toBeNull();
      expect(calls[0].guestName).toBeNull();
    }
  });

  it("trims a non-empty name", async () => {
    const { repo, calls } = makeRepo();
    const result = await startGuestSession(repo, {
      publicId: "evt-active",
      guestName: "  Fante  ",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.guest_name).toBe("Fante");
    expect(calls[0].guestName).toBe("Fante");
  });

  it("rejects invalid guest_name with 422 INVALID_INPUT data", async () => {
    const { repo, calls } = makeRepo();
    for (const bad of [123, "x".repeat(101), "bad\u0000"] as const) {
      const result = await startGuestSession(repo, {
        publicId: "evt-active",
        guestName: bad,
      });
      expect(result).toEqual({
        kind: "invalid_guest_name",
        fields: { guest_name: "Guest name is invalid or too long." },
      });
    }
    expect(calls).toHaveLength(0);
  });

  it("returns not_found for an unknown event", async () => {
    const { repo, calls } = makeRepo();
    const result = await startGuestSession(repo, {
      publicId: "evt-missing",
      guestName: "Fante",
    });
    expect(result.kind).toBe("not_found");
    expect(calls).toHaveLength(0);
  });

  it("rejects CLOSED and ARCHIVED events", async () => {
    for (const publicId of ["evt-closed", "evt-archived"]) {
      const { repo, calls } = makeRepo();
      const result = await startGuestSession(repo, {
        publicId,
        guestName: "Fante",
      });
      expect(result.kind).toBe("event_closed");
      expect(calls).toHaveLength(0);
    }
  });

  it("propagates persistence failures to the caller (mapped to 500 in route)", async () => {
    const { repo } = makeRepo({
      async createGuestSession() {
        throw new Error("db down");
      },
    });
    await expect(
      startGuestSession(repo, { publicId: "evt-active", guestName: "Fante" }),
    ).rejects.toThrow("db down");
  });
});