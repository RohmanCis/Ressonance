import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  createFakeAdminMediaDb,
  type FakeMediaDbState,
} from "@/test/admin-media-db";

/**
 * Route tests for GET /api/admin/media/{media_id}/download (API Contract 5.9).
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
  return new NextRequest(`http://localhost/api/admin/media/${mediaId}/download`, {
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
    voice_notes: [],
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getUser = { ok: true, id: "admin-1" };
  seed();
});

describe("GET /api/admin/media/{media_id}/download", () => {
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

  it("returns 302 redirect to a signed URL and never JSON", async () => {
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    expect(location).toContain("https://signed.example/");
    expect(location).toContain("events/e1/sessions/s1/photos/k1.jpg");
    // No JSON body on success.
    const text = await res.text();
    expect(text).not.toContain("expires_at");
    expect(text).not.toContain("storage_key");
  });

  it("returns 502 MEDIA_ACCESS_FAILED when signing fails", async () => {
    state.signError = { message: "boom" };
    const res = await GET(makeRequest("photo-1"), { params: Promise.resolve({ media_id: "photo-1" }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("MEDIA_ACCESS_FAILED");
  });
});