import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  GUEST_SESSION_COOKIE,
  generateSessionToken,
  hashSessionToken,
} from "@/lib/guest-session";

/**
 * Route-level tests for POST /api/events/{public_id}/guest-messages
 * (API Contract 6.6, Opsi B). The pg pool and rate limiter are mocked so the
 * handler runs without a live DB; the real transaction choreography is
 * verified by the unit + integration suites.
 */

let rateCalls = 0;

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    FixedWindowRateLimiter: class {
      check() {
        rateCalls += 1;
        return rateCalls > 2
          ? { allowed: false, retryAfterSeconds: 5 }
          : { allowed: true, retryAfterSeconds: null };
      }
    },
  };
});

let events: Record<string, { id: string; status: string }> = {};
let sessions: Record<
  string,
  { id: string; event_id: string; session_token: string; guest_name: string | null; expires_at: string }
> = {};
let photoCount = 0;
let voiceNoteExists = false;
let failInsert = false;
let failUnique = false;
let failUsage = false;
let inserted: { sessionId: string; messageText: string }[] = [];

function fakeClient() {
  return {
    async query(text: string, params: unknown[] = []) {
      if (text.includes("SELECT id, status FROM events")) {
        const ev = events[params[0] as string];
        return { rows: ev ? [{ id: ev.id, status: ev.status }] : [] };
      }
      if (text.includes("SELECT status FROM events WHERE id")) {
        const ev = Object.values(events).find((e) => e.id === params[0]);
        return { rows: ev ? [{ status: ev.status }] : [] };
      }
      if (text.includes("FROM guest_sessions WHERE session_token")) {
        const s = sessions[params[0] as string];
        return {
          rows: s
            ? [{ id: s.id, event_id: s.event_id, session_token: s.session_token, guest_name: s.guest_name, expires_at: s.expires_at }]
            : [],
        };
      }
      if (text.includes("BEGIN") || text.includes("FOR UPDATE") || text.includes("COMMIT") || text.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (text.includes("SELECT EXISTS(SELECT 1 FROM guest_messages")) {
        return { rows: [{ exists: false }] };
      }
      if (text.includes("COUNT(*)") && text.includes("FROM photos")) {
        if (failUsage) throw new Error("count failed");
        return { rows: [{ count: photoCount }] };
      }
      if (text.includes("SELECT EXISTS(SELECT 1 FROM voice_notes")) {
        if (failUsage) throw new Error("voice exists failed");
        return { rows: [{ exists: voiceNoteExists }] };
      }
      if (text.includes("INSERT INTO guest_messages")) {
        if (failUnique) {
          throw { code: "23505", constraint: "uq_guest_messages_one_per_session" };
        }
        if (failInsert) throw new Error("insert failed");
        inserted.push({ sessionId: params[0] as string, messageText: params[1] as string });
        return { rows: [{ id: "message-rt-1", created_at: "2026-08-17T10:00:00Z" }] };
      }
      throw new Error("unmapped query: " + text);
    },
    release() {},
  };
}

vi.mock("@/lib/db", () => ({
  getPgPool: () => ({ connect: async () => fakeClient() }),
}));

import { POST } from "./route";

const params = Promise.resolve({ public_id: "evt-active" });

function makeRequest(overrides: {
  token?: string;
  contentType?: string;
  body?: string;
} = {}) {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? "application/json");
  if (overrides.token) headers.set("cookie", `${GUEST_SESSION_COOKIE}=${overrides.token}`);
  return new NextRequest("http://localhost/api/events/evt-active/guest-messages", {
    method: "POST",
    headers,
    body: overrides.body ?? JSON.stringify({ message_text: "Terima kasih!" }),
  });
}

function seedSession() {
  const token = generateSessionToken();
  sessions[hashSessionToken(token)] = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
    expires_at: "2099-01-01T00:00:00Z",
  };
  return token;
}

/**
 * Wrap a request's body in a Proxy that counts how many times `getReader()` is
 * called. For auth-failure/rate-limited paths the body is never read.
 */
function withBodyReadCounter(request: NextRequest): () => number {
  const original = request.body!;
  let reads = 0;
  const wrapped = new Proxy(original, {
    get(target, prop) {
      if (prop === "getReader") {
        return () => {
          reads += 1;
          return target.getReader();
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  Object.defineProperty(request, "body", { value: wrapped, configurable: true });
  return () => reads;
}

function counterRequest(token?: string, body?: string) {
  const request = makeRequest({ token, body });
  const reads = withBodyReadCounter(request);
  return { request, reads };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TRUSTED_PROXY", "1");
  rateCalls = 0;
  photoCount = 0;
  voiceNoteExists = false;
  failInsert = false;
  failUnique = false;
  failUsage = false;
  inserted = [];
  events = { "evt-active": { id: "event-1", status: "ACTIVE" } };
  sessions = {};
});

describe("POST /api/events/{public_id}/guest-messages (route)", () => {
  it("returns 400 for a non-JSON Content-Type", async () => {
    const res = await POST(makeRequest({ contentType: "multipart/form-data" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for malformed JSON", async () => {
    const token = seedSession();
    const res = await POST(makeRequest({ token, body: "{not json" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when the body exceeds the bounded read cap", async () => {
    const token = seedSession();
    const res = await POST(makeRequest({ token, body: "x".repeat(5 * 1024) }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 422 INVALID_INPUT with a message_text field for a missing value", async () => {
    const token = seedSession();
    const res = await POST(makeRequest({ token, body: JSON.stringify({}) }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(typeof body.error.fields?.message_text).toBe("string");
    expect(inserted).toHaveLength(0);
  });

  it("returns 422 INVALID_INPUT for whitespace-only and over-length text", async () => {
    const token = seedSession();
    const blank = await POST(makeRequest({ token, body: JSON.stringify({ message_text: "   " }) }), { params });
    expect(blank.status).toBe(422);
    const blankBody = await blank.json();
    expect(blankBody.error.code).toBe("INVALID_INPUT");

    const tooLong = await POST(
      makeRequest({ token, body: JSON.stringify({ message_text: "x".repeat(281) }) }),
      { params },
    );
    expect(tooLong.status).toBe(422);
    const longBody = await tooLong.json();
    expect(longBody.error.code).toBe("INVALID_INPUT");
    expect(longBody.error.fields.message_text).toContain("280");
    expect(inserted).toHaveLength(0);
  });

  it("returns 201 with the exact submission + usage and no sensitive leakage", async () => {
    const token = seedSession();
    photoCount = 2;
    voiceNoteExists = true;
    const res = await POST(makeRequest({ token, body: JSON.stringify({ message_text: "  Terima kasih!  " }) }), { params });
    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toEqual({
      submission: {
        id: "message-rt-1",
        type: "GUEST_MESSAGE",
        created_at: "2026-08-17T10:00:00Z",
        message_text: "Terima kasih!",
      },
      usage: {
        photos_submitted: 2,
        photos_remaining: 3,
        voice_note_submitted: true,
        voice_note_available: false,
        guest_message_submitted: true,
        guest_message_available: false,
      },
    });
    expect(text).not.toContain(token);
    expect(text).not.toContain("session_token");
    expect(text).not.toContain("session-1");
    expect(text).not.toContain("event-1");
  });

  it("stores the trimmed text", async () => {
    const token = seedSession();
    await POST(makeRequest({ token, body: JSON.stringify({ message_text: "  pesan & kesan  " }) }), { params });
    expect(inserted).toEqual([{ sessionId: "session-1", messageText: "pesan & kesan" }]);
  });

  it("returns 409 GUEST_MESSAGE_LIMIT_REACHED on a second submission from the same session", async () => {
    const token = seedSession();
    failUnique = true;
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("GUEST_MESSAGE_LIMIT_REACHED");
  });

  it("returns 404 NOT_FOUND for an unknown event, without reading the body", async () => {
    const { request, reads } = counterRequest(seedSession());
    const res = await POST(request, {
      params: Promise.resolve({ public_id: "evt-missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(reads()).toBe(0);
  });

  it("returns 422 EVENT_CLOSED for a CLOSED event, without reading the body", async () => {
    events["evt-closed"] = { id: "event-2", status: "CLOSED" };
    const token = seedSession();
    sessions[hashSessionToken(token)].event_id = "event-2";
    const { request, reads } = counterRequest(token);
    const res = await POST(request, {
      params: Promise.resolve({ public_id: "evt-closed" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("EVENT_CLOSED");
    expect(reads()).toBe(0);
  });

  it("returns 401 SESSION_REQUIRED without a cookie, without reading the body", async () => {
    const { request, reads } = counterRequest();
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_REQUIRED");
    expect(reads()).toBe(0);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 SESSION_INVALID and clears the cookie for a wrong-event session, without reading the body", async () => {
    const token = seedSession();
    sessions[hashSessionToken(token)].event_id = "event-2";
    const { request, reads } = counterRequest(token);
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_INVALID");
    expect(reads()).toBe(0);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("returns 401 SESSION_EXPIRED and clears the cookie for an expired session, without reading the body", async () => {
    const token = generateSessionToken();
    sessions[hashSessionToken(token)] = {
      id: "session-exp",
      event_id: "event-1",
      session_token: hashSessionToken(token),
      guest_name: null,
      expires_at: new Date(Date.now() - 60000).toISOString(),
    };
    const { request, reads } = counterRequest(token);
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_EXPIRED");
    expect(reads()).toBe(0);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("returns 429 RATE_LIMITED with Retry-After and does not read the body", async () => {
    const first = await POST(makeRequest({ token: seedSession() }), { params });
    expect(first.status).toBe(201);
    const second = await POST(makeRequest({ token: seedSession() }), { params });
    expect(second.status).toBe(201);
    const thirdReq = counterRequest(seedSession());
    const third = await POST(thirdReq.request, { params });
    expect(third.status).toBe(429);
    const body = await third.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(Number(third.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(thirdReq.reads()).toBe(0);
  });

  it("does not consume the rate limit for an unauthorized request", async () => {
    const { request, reads } = counterRequest();
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    expect(rateCalls).toBe(0);
    expect(reads()).toBe(0);
  });

  it("maps a persistence failure to 500 INTERNAL_ERROR", async () => {
    failInsert = true;
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("maps a usage-query failure to 500 INTERNAL_ERROR", async () => {
    failUsage = true;
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
