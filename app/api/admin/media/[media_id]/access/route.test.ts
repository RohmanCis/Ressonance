import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  createFakeAdminMediaDb,
  type FakeMediaDbState,
} from "@/test/admin-media-db";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/admin-media-repo";

/**
 * Route tests for GET /api/admin/media/{media_id}/access (API Contract 5.8).
 * Mocks the SSR auth client, service-role db, and config.
 */

let state: FakeMediaDbState = { events: [], sessions: [], photos: [], voice_notes: [] };
let getUser: { ok: true; id: string } | { ok: false } = { ok: false };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        if (getUser.ok) return { data: { user: { id: getUser.id } }, error: null };
        return { data: { user: null }, error: { message: "missing" } };
      },
    },
  }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => createFakeAdminMediaDb(state),
}));

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

import { GET } from "./route";

function makeRequest(mediaId: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/media/${mediaId}/access`, {
    method: "GET",
  });
}

function seed() {
  state = {
    events: [{ id: "event-1", public_id: "evt-1", admin_id: "admin-1" }],
    sessions: [{ id: "session-1", event_id: "event-1", guest_name: "Fante" }],
    photos: [
      {
        id: "photo-1",
        guest_session_id: "session-1",
        storage_key: "events/e1/sessions/s1/photos/k1.jpg",
        mime_type: "image/jpeg",
        file_size: 100,
        created_at: "2026-08-11T12:15:21Z",
      },
    ],
    voice_notes: [
      {
        id: "voice-1",
        guest_session_id: "session-1",
        storage_key: "events/e1/sessions/s1/voices/k2.webm",
        mime_type: "audio/webm",
        file_size: 300,
        duration_seconds: 12,
        created_at: "2026-08-11T12:16:40Z",
      },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getUser = { ok: true, id: "admin-1" };
  seed();
});

describe("GET /api/admin/media/{media_id}/access", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 404 NOT_FOUND for an unknown media id", async () => {
    const res = await GET(makeRequest("nope"), { params: Promise.resolve({ media_id: "nope" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 FORBIDDEN when the admin does not own the media's event", async () => {
    state.events[0].admin_id = "someone-else";
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 NOT_FOUND when the media's session has no event", async () => {
    state.sessions[0].event_id = "event-ghost";
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with signed url + expires_at and no storage leak", async () => {
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("https://signed.example/");
    expect(body.url).toContain("events/e1/sessions/s1/photos/k1.jpg");
    expect(typeof body.expires_at).toBe("string");
    expect(Number.isNaN(Date.parse(body.expires_at))).toBe(false);
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.parse("2026-08-11T12:15:21Z"));
    // only the two contract fields
    expect(Object.keys(body).sort()).toEqual(["expires_at", "url"]);
    expect(text).not.toContain("storage_key");
    expect(text).not.toContain("guest_session_id");
    expect(text).not.toContain("session-1");
  });

  it("issues a short-lived signed URL bounded by SIGNED_URL_TTL_SECONDS", async () => {
    const before = Date.now();
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    const after = Date.now();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The TTL passed to createSignedUrl is embedded in the fake URL.
    expect(body.url).toContain(`t=${SIGNED_URL_TTL_SECONDS}`);
    // expires_at must fall within [before, before + TTL] — short-lived, not far-future.
    const expires = Date.parse(body.expires_at);
    expect(expires).toBeGreaterThanOrEqual(before + SIGNED_URL_TTL_SECONDS * 1000);
    expect(expires).toBeLessThanOrEqual(after + SIGNED_URL_TTL_SECONDS * 1000);
  });

  it("returns 200 with a signed url for a voice note", async () => {
    const res = await GET(makeRequest("voice-1"), { params: Promise.resolve({ media_id: "voice-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("events/e1/sessions/s1/voices/k2.webm");
  });

  it("returns 502 MEDIA_ACCESS_FAILED when signing fails", async () => {
    state.signError = { message: "boom" };
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("MEDIA_ACCESS_FAILED");
  });
});