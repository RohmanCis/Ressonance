import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  GUEST_SESSION_COOKIE,
  generateSessionToken,
  hashSessionToken,
} from "@/lib/guest-session";

/**
 * Route-level tests for POST/GET /api/events/{public_id}/session
 * (API Contract 6.2 / 6.3). The Supabase service-role client is mocked so the
 * handler runs without a live DB; the real DB is verified by the integration
 * suite.
 */

let events: { id: string; public_id: string; title: string; status: string }[] = [];
let createdSessions: Record<string, unknown>[] = [];
let sessions: { id: string; event_id: string; session_token: string; guest_name: string | null }[] = [];
let photosBySession: Record<string, number> = {};
let voiceNotesBySession: Record<string, number> = {};

function makeDb() {
  return {
    from(table: string) {
      if (table === "events") {
        return {
          select() {
            return {
              eq(_col: string, value: string) {
                return {
                  maybeSingle: async () => {
                    const hit = events.find((e) => e.public_id === value);
                    return hit ? { data: hit, error: null } : { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "guest_sessions") {
        return {
          insert(input: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: async () => {
                    createdSessions.push(input);
                    return { data: { id: "session-1" }, error: null };
                  },
                };
              },
            };
          },
          select() {
            return {
              eq(_col: string, value: string) {
                return {
                  maybeSingle: async () => {
                    const hit = sessions.find((s) => s.session_token === value);
                    return hit ? { data: hit, error: null } : { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "photos" || table === "voice_notes") {
        return {
          select(_col: string, _opts?: { count?: string; head?: boolean }) {
            void _opts;
            return {
              eq(_col: string, sessionId: string) {
                const count =
                  table === "photos"
                    ? photosBySession[sessionId] ?? 0
                    : voiceNotesBySession[sessionId] ?? 0;
                return { count, error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => makeDb(),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    loadRateLimitConfig: () => ({ max: 2, windowMs: 60_000 }),
  };
});

import { POST, GET } from "./route";

const params = Promise.resolve({ public_id: "evt-active" });

function makeRequest(overrides: {
  body?: string;
  contentType?: string | null;
  ip?: string;
} = {}) {
  const headers = new Headers();
  if (overrides.contentType !== null) {
    headers.set("content-type", overrides.contentType ?? "application/json");
  }
  if (overrides.ip) headers.set("x-forwarded-for", overrides.ip);
  return new NextRequest("http://localhost/api/events/evt-active/session", {
    method: "POST",
    headers,
    body: overrides.body ?? JSON.stringify({ guest_name: "Fante" }),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TRUSTED_PROXY", "1");
  events = [
    { id: "event-1", public_id: "evt-active", title: "Active Party", status: "ACTIVE" },
    { id: "event-2", public_id: "evt-closed", title: "Old Party", status: "CLOSED" },
  ];
  createdSessions = [];
  sessions = [];
  photosBySession = {};
  voiceNotesBySession = {};
});

describe("POST /api/events/{public_id}/session", () => {
  it("returns 201 with the session body and sets the HttpOnly cookie", async () => {
    const res = await POST(makeRequest({ ip: "ip-201" }), { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      session: {
        event_public_id: "evt-active",
        guest_name: "Fante",
        photos_submitted: 0,
        photos_remaining: 5,
        voice_note_submitted: false,
        voice_note_available: true,
      },
    });
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("httponly");
    expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    expect(setCookie?.toLowerCase()).toContain("path=/");
    expect(setCookie).not.toContain("Domain=");
  });

  it("does not expose the token or database PK in the response", async () => {
    const res = await POST(makeRequest({ ip: "ip-noleak" }), { params });
    const text = await res.text();
    expect(text).not.toContain("session_token");
    expect(text).not.toContain("session-1");
    expect(text).not.toContain("event-1");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await POST(makeRequest({ ip: "ip-404", body: JSON.stringify({}) }), {
      params: Promise.resolve({ public_id: "evt-missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 422 EVENT_CLOSED for a CLOSED event", async () => {
    const res = await POST(makeRequest({ ip: "ip-closed", body: JSON.stringify({}) }), {
      params: Promise.resolve({ public_id: "evt-closed" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("EVENT_CLOSED");
  });

  it("returns 422 INVALID_INPUT for an invalid guest_name", async () => {
    const res = await POST(
      makeRequest({ ip: "ip-invalid", body: JSON.stringify({ guest_name: "x".repeat(101) }) }),
      { params },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.fields).toBeDefined();
  });

  it("returns 400 INVALID_REQUEST for a malformed JSON body", async () => {
    const res = await POST(makeRequest({ ip: "ip-malformed", body: "{not json" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST when Content-Type is not application/json", async () => {
    const res = await POST(makeRequest({ ip: "ip-ctype", contentType: "text/plain" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 429 RATE_LIMITED with Retry-After when the quota is exceeded", async () => {
    const first = await POST(makeRequest({ ip: "203.0.113.9" }), { params });
    expect(first.status).toBe(201);
    const second = await POST(makeRequest({ ip: "203.0.113.9" }), { params });
    expect(second.status).toBe(201);
    const third = await POST(makeRequest({ ip: "203.0.113.9" }), { params });
    expect(third.status).toBe(429);
    const body = await third.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(Number(third.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("does not rate-limit a different client identity", async () => {
    const res = await POST(makeRequest({ ip: "198.51.100.5" }), { params });
    expect(res.status).toBe(201);
  });

  it("ignores spoofed forwarded headers without a trusted proxy (single bucket)", async () => {
    // Without TRUSTED_PROXY, all requests share one coarse bucket, so distinct
    // (spoofed) X-Forwarded-For values cannot isolate or bypass the limit.
    vi.stubEnv("TRUSTED_PROXY", undefined);
    const a = await POST(makeRequest({ ip: "203.0.113.1" }), { params });
    const b = await POST(makeRequest({ ip: "203.0.113.2" }), { params });
    const c = await POST(makeRequest({ ip: "203.0.113.3" }), { params });
    expect([a.status, b.status, c.status]).toEqual([201, 201, 429]);
    vi.stubEnv("TRUSTED_PROXY", "1");
  });
});

function makeGetRequest(cookieToken?: string, publicId = "evt-active") {
  const headers = new Headers();
  if (cookieToken) {
    headers.set("cookie", `${GUEST_SESSION_COOKIE}=${cookieToken}`);
  }
  return new NextRequest(`http://localhost/api/events/${publicId}/session`, {
    method: "GET",
    headers,
  });
}

function seedSession(opts: {
  eventId: string;
  photos?: number;
  voiceNotes?: number;
  guestName?: string | null;
}) {
  const token = generateSessionToken();
  sessions.push({
    id: "session-" + token.slice(0, 8),
    event_id: opts.eventId,
    session_token: hashSessionToken(token),
    guest_name: opts.guestName ?? null,
  });
  photosBySession[sessions[0].id] = opts.photos ?? 0;
  voiceNotesBySession[sessions[0].id] = opts.voiceNotes ?? 0;
  return token;
}

describe("GET /api/events/{public_id}/session", () => {
  it("returns 200 usage shape with event status and counts", async () => {
    const token = seedSession({ eventId: "event-1", photos: 2, guestName: "Fante" });
    const res = await GET(makeGetRequest(token), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      event: { public_id: "evt-active", title: "Active Party", status: "ACTIVE" },
      guest_name: "Fante",
      photos_submitted: 2,
      photos_remaining: 3,
      voice_note_submitted: false,
      voice_note_available: true,
    });
  });

  it("reflects the voice-note and name state", async () => {
    const token = seedSession({
      eventId: "event-1",
      voiceNotes: 1,
      guestName: "Song",
    });
    const res = await GET(makeGetRequest(token), { params });
    const body = await res.json();
    expect(body.voice_note_submitted).toBe(true);
    expect(body.voice_note_available).toBe(false);
    expect(body.guest_name).toBe("Song");
  });

  it("returns 401 SESSION_REQUIRED without a cookie", async () => {
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_REQUIRED");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 SESSION_INVALID and clears the cookie for a malformed token", async () => {
    const res = await GET(makeGetRequest("bad token!"), { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_INVALID");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("returns 401 SESSION_INVALID and clears the cookie for an unknown token", async () => {
    const res = await GET(makeGetRequest("unknown-token-123456"), { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_INVALID");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns 401 SESSION_INVALID and clears the cookie for a session of another event", async () => {
    const token = seedSession({ eventId: "event-2" });
    const res = await GET(makeGetRequest(token), { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_INVALID");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await GET(makeGetRequest("unknown-token-123456", "evt-missing"), {
      params: Promise.resolve({ public_id: "evt-missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("keeps a CLOSED event readable with a matching session", async () => {
    const token = seedSession({ eventId: "event-2" });
    const res = await GET(makeGetRequest(token, "evt-closed"), {
      params: Promise.resolve({ public_id: "evt-closed" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.status).toBe("CLOSED");
  });

  it("does not expose the raw token, DB PK, or storage keys", async () => {
    const token = seedSession({ eventId: "event-1", photos: 1 });
    const res = await GET(makeGetRequest(token), { params });
    const text = await res.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain("session-");
    expect(text).not.toContain("storage_key");
    expect(text).not.toContain("event-1");
  });
});