import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import type { AudioInspection } from "@/lib/audio-inspector";
import { GUEST_SESSION_COOKIE, hashSessionToken, generateSessionToken } from "@/lib/guest-session";

/**
 * Route-level tests for POST /api/events/{public_id}/voice-notes (API Contract 6.5).
 * The pg pool, service-role client, config, rate limiter, and audio inspector
 * are mocked so the handler runs without a live DB/storage/ffprobe; the real
 * transaction choreography and concurrency are verified by the unit + integration
 * suites. The inspector is controlled to return any inspection result.
 */

let rateCalls = 0;
let uploads: string[] = [];

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

vi.mock("@/lib/config", () => ({
  getServerConfig: () => ({
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "a",
    supabaseServiceRoleKey: "s",
    appUrl: "http://localhost",
    databaseUrl: "postgres://x",
    supabaseStorageBucket: "bucket",
  }),
}));

let inspection: AudioInspection = { status: "ok", durationSeconds: 12, formatName: "webm" };

vi.mock("@/lib/audio-inspector", () => ({
  createFfprobeAudioInspector: () => ({
    async inspect() {
      return inspection;
    },
  }),
}));

let events: Record<string, { id: string; status: string }> = {};
let sessions: Record<string, { id: string; event_id: string; session_token: string; guest_name: string | null }> = {};
let photoCount = 0;
let failCount = false;
let failUpload = false;
let failUnique = false;

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
            ? [{ id: s.id, event_id: s.event_id, session_token: s.session_token, guest_name: s.guest_name }]
            : [],
        };
      }
      if (text.includes("BEGIN") || text.includes("FOR UPDATE") || text.includes("COMMIT") || text.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (text.includes("SELECT EXISTS(SELECT 1 FROM voice_notes")) {
        return { rows: [{ exists: false }] };
      }
      if (text.includes("COUNT(*)") && text.includes("FROM photos")) {
        if (failCount) throw new Error("count failed");
        return { rows: [{ count: photoCount }] };
      }
      if (text.includes("INSERT INTO voice_notes")) {
        if (failUnique) {
          throw { code: "23505", constraint: "uq_voice_notes_one_per_session" };
        }
        return { rows: [{ id: "media-rt-vn", created_at: "2026-08-11T12:16:04Z" }] };
      }
      throw new Error("unmapped query: " + text);
    },
    release() {},
  };
}

vi.mock("@/lib/db", () => ({
  getPgPool: () => ({ connect: async () => fakeClient() }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        upload: async (key: string) => {
           uploads.push(key);
          if (failUpload) throw new Error("upload failed");
          return { error: null };
        },
        remove: async (keys: string[]) => {
          uploads = uploads.filter((k) => !keys.includes(k));
          return { error: null };
        },
      }),
    },
  }),
}));

import { POST } from "./route";

const params = Promise.resolve({ public_id: "evt-active" });

const BOUNDARY = "----testboundary123";

/** Build a valid multipart/form-data body for a single binary field. */
function multipartBody(fieldName: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="note.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
  );
  const footer = enc.encode(`\r\n--${BOUNDARY}--\r\n`);
  const body = new Uint8Array(header.length + data.length + footer.length);
  body.set(header, 0);
  body.set(data, header.length);
  body.set(footer, header.length + data.length);
  return body;
}

function makeRequest(overrides: { token?: string; contentType?: string; field?: boolean; dataSize?: number } = {}) {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? `multipart/form-data; boundary=${BOUNDARY}`);
  if (overrides.token) headers.set("cookie", `${GUEST_SESSION_COOKIE}=${overrides.token}`);
  const data = new Uint8Array(overrides.dataSize ?? 40).fill(0x41);
  const body = overrides.field === false ? multipartBody("other", data) : multipartBody("voice_note", data);
  return new NextRequest("http://localhost/api/events/evt-active/voice-notes", {
    method: "POST",
    headers,
    body: body.buffer as ArrayBuffer,
  });
}

function seedSession() {
  const token = generateSessionToken();
  sessions[hashSessionToken(token)] = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
  };
  return token;
}

/**
 * Wrap a request's body in a Proxy that counts how many times `getReader()` is
 * called, i.e. how many times the route actually reads the body. For
 * auth-failure/rate-limited paths the body is never read, so the count is 0.
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

/** Build a request and install a body-read counter. */
function counterRequest(token?: string, opts: { dataSize?: number } = {}) {
  const request = makeRequest({ token, ...opts });
  const reads = withBodyReadCounter(request);
  return { request, reads };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TRUSTED_PROXY", "1");
  rateCalls = 0;
  uploads = [];
  photoCount = 0;
  failCount = false;
  failUpload = false;
  failUnique = false;
  inspection = { status: "ok", durationSeconds: 12, formatName: "webm" };
  events = { "evt-active": { id: "event-1", status: "ACTIVE" } };
  sessions = {};
});

describe("POST /api/events/{public_id}/voice-notes (route)", () => {
  it("returns 400 for a non-multipart Content-Type", async () => {
    const res = await POST(makeRequest({ contentType: "application/json" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when the voice_note field is missing", async () => {
    const token = seedSession();
    const res = await POST(makeRequest({ token, field: false }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 429 RATE_LIMITED with Retry-After when the quota is exceeded", async () => {
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
    // Rate limiting precedes body reading: the rate-limited body is never pulled.
    expect(thirdReq.reads()).toBe(0);
  });

  it("applies the rate limit before reading the body for an authorized request", async () => {
    const token = seedSession();
    const { request, reads } = counterRequest(token);
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
    expect(rateCalls).toBe(1);
    // The body was read (upload proceeded) after the rate limit passed.
    expect(reads()).toBeGreaterThan(0);
  });

  it("returns 201 with exact submission + usage and no sensitive leakage", async () => {
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toEqual({
      submission: {
        id: "media-rt-vn",
        type: "VOICE_NOTE",
        created_at: "2026-08-11T12:16:04Z",
        mime_type: "audio/webm",
        file_size: 40,
        duration_seconds: 12,
      },
      usage: {
        photos_submitted: 0,
        photos_remaining: 5,
        voice_note_submitted: true,
        voice_note_available: false,
      },
    });
    expect(text).not.toContain(token);
    expect(text).not.toContain("session_token");
    expect(text).not.toContain("session-1");
    expect(text).not.toContain("event-1");
    expect(text).not.toContain(uploads[0]);
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

  it("returns 401 SESSION_REQUIRED when no cookie is present, without reading the body", async () => {
    const { request, reads } = counterRequest();
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_REQUIRED");
    expect(reads()).toBe(0);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 SESSION_INVALID and clears the cookie for an unknown cookie, without reading the body", async () => {
    const { request, reads } = counterRequest("unknown-token-123456");
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("SESSION_INVALID");
    expect(reads()).toBe(0);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("does not consume the rate limit for an unauthorized request", async () => {
    const { request, reads } = counterRequest();
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    expect(rateCalls).toBe(0);
    expect(reads()).toBe(0);
  });

  it("returns 422 FILE_TOO_LARGE above the configured size limit", async () => {
    vi.stubEnv("VOICE_NOTE_MAX_SIZE_BYTES", "100");
    const token = seedSession();
    const res = await POST(makeRequest({ token, dataSize: 200 }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
    expect(uploads).toHaveLength(0);
    vi.stubEnv("VOICE_NOTE_MAX_SIZE_BYTES", undefined);
  });

  it("returns 422 AUDIO_DURATION_INVALID when the duration is out of range", async () => {
    inspection = { status: "ok", durationSeconds: 4.5, formatName: "webm" };
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("AUDIO_DURATION_INVALID");
    expect(uploads).toHaveLength(0);
  });

  it("returns 422 AUDIO_UNINSPECTABLE when ffprobe cannot inspect", async () => {
    inspection = { status: "uninspectable" };
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("AUDIO_UNINSPECTABLE");
    expect(uploads).toHaveLength(0);
  });

  it("returns 422 UNSUPPORTED_MEDIA for an unapproved format", async () => {
    inspection = { status: "ok", durationSeconds: 12, formatName: "flac" };
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA");
    expect(uploads).toHaveLength(0);
  });

  it("maps a transaction count failure to 502 MEDIA_PERSISTENCE_FAILED", async () => {
    failCount = true;
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("MEDIA_PERSISTENCE_FAILED");
  });

  it("maps the voice-note unique constraint to 409 VOICE_NOTE_LIMIT_REACHED", async () => {
    failUnique = true;
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("VOICE_NOTE_LIMIT_REACHED");
    expect(uploads).toHaveLength(0);
  });

  it("maps upload failure to 502 and compensates the attempted object", async () => {
    failUpload = true;
    const token = seedSession();
    const res = await POST(makeRequest({ token }), { params });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("MEDIA_PERSISTENCE_FAILED");
    expect(uploads).toHaveLength(0);
  });
});
