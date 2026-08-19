import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { GUEST_SESSION_COOKIE, generateSessionToken, hashSessionToken } from "@/lib/guest-session";
import {
  createGuestSubmissionHandler,
  type GuestSubmissionPipelineConfig,
} from "@/lib/guest-submission-pipeline";

/**
 * Shared guest-submission pipeline tests (architecture deepening #1).
 * The pg pool is mocked with a client handling the auth SQL; extract/submit
 * are typed fakes per test, so the auth-kind → HTTP mapping, extract-failure,
 * submit-failure, rate-limit, and 500 paths are crossed without a live DB.
 */

let events: Record<string, { id: string; status: string }> = {};
let sessions: Record<
  string,
  { id: string; event_id: string; session_token: string; guest_name: string | null; expires_at: string }
> = {};

function fakeClient() {
  return {
    async query(text: string, params: unknown[] = []) {
      if (text.includes("SELECT id, status FROM events")) {
        const ev = events[params[0] as string];
        return { rows: ev ? [{ id: ev.id, status: ev.status }] : [] };
      }
      if (text.includes("FROM guest_sessions WHERE session_token")) {
        const s = sessions[params[0] as string];
        return {
          rows: s
            ? [{ id: s.id, event_id: s.event_id, session_token: s.session_token, guest_name: s.guest_name, expires_at: s.expires_at }]
            : [],
        };
      }
      throw new Error("unmapped query: " + text);
    },
    release() {},
  };
}

vi.mock("@/lib/db", () => ({
  getPgPool: () => ({ connect: async () => fakeClient() }),
}));

function seedSession(overrides: Partial<{ expires_at: string; event_id: string }> = {}) {
  const token = generateSessionToken();
  sessions[hashSessionToken(token)] = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
  return token;
}

function makeRequest(token?: string) {
  const headers = new Headers();
  headers.set("content-type", "multipart/form-data; boundary=----b");
  if (token) headers.set("cookie", `${GUEST_SESSION_COOKIE}=${token}`);
  return new NextRequest("http://localhost/api/events/evt-active/photos", {
    method: "POST",
    headers,
    body: "x",
  });
}

const params = Promise.resolve({ public_id: "evt-active" });

function makeConfig(
  overrides: Partial<GuestSubmissionPipelineConfig<unknown>> = {},
): GuestSubmissionPipelineConfig<unknown> {
  return {
    errorEventName: "test_submit_failed",
    rateLimitConfig: { max: 1000, windowMs: 60_000 },
    rateLimitedMessage: "Too many requests.",
    guard: () => null,
    extract: async () => ({ ok: true as const, payload: {} }),
    submit: async () => ({
      ok: true as const,
      usage: {
        photos_submitted: 1,
        photos_remaining: 4,
        voice_note_submitted: false,
        voice_note_available: true,
      },
      data: { submission: { id: "m-1" } },
    }),
    mapSubmitError: (kind) => ({ status: 422, code: kind, message: "Submission failed." }),
    ...overrides,
  };
}

beforeEach(() => {
  events = { "evt-active": { id: "event-1", status: "ACTIVE" } };
  sessions = {};
});

describe("createGuestSubmissionHandler", () => {
  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const handler = createGuestSubmissionHandler(makeConfig());
    const res = await handler(makeRequest(), { params: Promise.resolve({ public_id: "evt-missing" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 422 EVENT_CLOSED for a non-ACTIVE event", async () => {
    events["evt-closed"] = { id: "event-2", status: "CLOSED" };
    const handler = createGuestSubmissionHandler(makeConfig());
    const res = await handler(makeRequest(seedSession({ event_id: "event-2" })), {
      params: Promise.resolve({ public_id: "evt-closed" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("EVENT_CLOSED");
  });

  it("returns 401 SESSION_REQUIRED without a cookie, without clearing it", async () => {
    const handler = createGuestSubmissionHandler(makeConfig());
    const res = await handler(makeRequest(), { params });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("SESSION_REQUIRED");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 401 SESSION_INVALID and clears the cookie for a wrong-event session", async () => {
    const handler = createGuestSubmissionHandler(makeConfig());
    const res = await handler(makeRequest(seedSession({ event_id: "event-2" })), { params });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("SESSION_INVALID");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("returns 401 SESSION_EXPIRED and clears the cookie for an expired session", async () => {
    const handler = createGuestSubmissionHandler(makeConfig());
    const res = await handler(
      makeRequest(seedSession({ expires_at: new Date(Date.now() - 60000).toISOString() })),
      { params },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("SESSION_EXPIRED");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  it("maps an extract failure to its 4xx status and code", async () => {
    const handler = createGuestSubmissionHandler(
      makeConfig({
        extract: async () => ({
          ok: false as const,
          status: 422,
          code: "FILE_TOO_LARGE",
          message: "The image exceeds the size limit.",
        }),
      }),
    );
    const res = await handler(makeRequest(seedSession()), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns 201 with submission + usage on submit success", async () => {
    const handler = createGuestSubmissionHandler(
      makeConfig({
        submit: async () => ({
          ok: true as const,
          usage: {
            photos_submitted: 2,
            photos_remaining: 3,
            voice_note_submitted: false,
            voice_note_available: true,
          },
          data: { submission: { id: "m-1", type: "PHOTO" } },
        }),
      }),
    );
    const res = await handler(makeRequest(seedSession()), { params });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      submission: { id: "m-1", type: "PHOTO" },
      usage: {
        photos_submitted: 2,
        photos_remaining: 3,
        voice_note_submitted: false,
        voice_note_available: true,
      },
    });
  });

  it("maps a submit failure via mapSubmitError with fields", async () => {
    const handler = createGuestSubmissionHandler(
      makeConfig({
        submit: async () => ({
          ok: false as const,
          kind: "invalid_input",
          fields: { message_text: "Message is required." },
        }),
        mapSubmitError: (kind, fields) => ({
          status: 422,
          code: "INVALID_INPUT",
          message: "Request validation failed.",
          fields,
        }),
      }),
    );
    const res = await handler(makeRequest(seedSession()), { params });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Request validation failed.",
        fields: { message_text: "Message is required." },
      },
    });
  });

  it("returns 429 RATE_LIMITED with Retry-After when the quota is exceeded", async () => {
    const handler = createGuestSubmissionHandler(
      makeConfig({ rateLimitConfig: { max: 1, windowMs: 60_000 } }),
    );
    const first = await handler(makeRequest(seedSession()), { params });
    expect(first.status).toBe(201);
    const second = await handler(makeRequest(seedSession()), { params });
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("returns 500 INTERNAL_ERROR when submit throws and logs the failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createGuestSubmissionHandler(
      makeConfig({
        submit: async () => {
          throw new Error("db exploded");
        },
      }),
    );
    const res = await handler(makeRequest(seedSession()), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
