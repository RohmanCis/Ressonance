import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import {
  createFakeAdminMediaDb,
  type FakeMediaDbState,
} from "@/test/admin-media-db";

/**
 * Route tests for GET /api/admin/events/{public_id}/submissions
 * (API Contract 5.7). Mocks the SSR auth client and the service-role db.
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

import { GET } from "./route";

function makeRequest(publicId: string, query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/events/${publicId}/submissions${query}`,
    { method: "GET" },
  );
}

function seed() {
  state = {
    events: [{ id: "event-1", public_id: "evt-1", admin_id: "admin-1" }],
    sessions: [
      { id: "session-1", event_id: "event-1", guest_name: "Fante", public_ref: "ref-s1" },
      { id: "session-2", event_id: "event-1", guest_name: "Ana", public_ref: "ref-s2" },
    ],
    photos: [
      {
        id: "photo-1",
        guest_session_id: "session-1",
        storage_key: "events/e1/sessions/s1/photos/k1.jpg",
        mime_type: "image/jpeg",
        file_size: 100,
        created_at: "2026-08-11T12:15:21Z",
      },
      {
        id: "photo-2",
        guest_session_id: "session-2",
        storage_key: "events/e1/sessions/s2/photos/k2.jpg",
        mime_type: "image/png",
        file_size: 200,
        created_at: "2026-08-11T12:16:00Z",
      },
    ],
    voice_notes: [
      {
        id: "voice-1",
        guest_session_id: "session-1",
        storage_key: "events/e1/sessions/s1/voices/k3.webm",
        mime_type: "audio/webm",
        file_size: 300,
        duration_seconds: 12,
        created_at: "2026-08-11T12:16:40Z",
      },
    ],
    guest_messages: [
      {
        id: "message-1",
        guest_session_id: "session-1",
        message_text: "Terima kasih, acaranya sangat berkesan!",
        created_at: "2026-08-11T12:17:32Z",
      },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getUser = { ok: true, id: "admin-1" };
  seed();
});

describe("GET /api/admin/events/{public_id}/submissions", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await GET(makeRequest("evt-missing"), { params: Promise.resolve({ public_id: "evt-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 FORBIDDEN when the admin does not own the event", async () => {
    state.events[0].admin_id = "someone-else";
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 INVALID_INPUT for an oversized guest_name", async () => {
    const res = await GET(makeRequest("evt-1", `?guest_name=${"a".repeat(201)}`), {
      params: Promise.resolve({ public_id: "evt-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("returns all submissions newest-first with exact metadata and no storage leak", async () => {
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toEqual({
      submissions: [
        { id: "message-1", type: "GUEST_MESSAGE", guest_name: "Fante", guest_session_ref: "ref-s1", created_at: "2026-08-11T12:17:32Z", mime_type: "text/plain", file_size: 0, duration_seconds: null, message_text: "Terima kasih, acaranya sangat berkesan!" },
        { id: "voice-1", type: "VOICE_NOTE", guest_name: "Fante", guest_session_ref: "ref-s1", created_at: "2026-08-11T12:16:40Z", mime_type: "audio/webm", file_size: 300, duration_seconds: 12 },
        { id: "photo-2", type: "PHOTO", guest_name: "Ana", guest_session_ref: "ref-s2", created_at: "2026-08-11T12:16:00Z", mime_type: "image/png", file_size: 200, duration_seconds: null },
        { id: "photo-1", type: "PHOTO", guest_name: "Fante", guest_session_ref: "ref-s1", created_at: "2026-08-11T12:15:21Z", mime_type: "image/jpeg", file_size: 100, duration_seconds: null },
      ],
    });
    expect(text).not.toContain("storage_key");
    expect(text).not.toContain("events/e1");
    expect(text).not.toContain("session-1");
    expect(text).not.toContain("event-1");
  });

  it("filters submissions by guest_name", async () => {
    const res = await GET(makeRequest("evt-1", "?guest_name=Ana"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toEqual([
      { id: "photo-2", type: "PHOTO", guest_name: "Ana", guest_session_ref: "ref-s2", created_at: "2026-08-11T12:16:00Z", mime_type: "image/png", file_size: 200, duration_seconds: null },
    ]);
  });

  it("returns an empty list when no submissions match the filter", async () => {
    const res = await GET(makeRequest("evt-1", "?guest_name=Nobody"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toEqual([]);
  });

  it("returns an empty list when the event has no sessions", async () => {
    state.sessions = [];
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toEqual([]);
  });
});