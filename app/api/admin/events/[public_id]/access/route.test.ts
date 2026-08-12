import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { createFakeDb, type FakeEventRow } from "@/test/admin-event-db";

/**
 * Route tests for GET /api/admin/events/{public_id}/access (API Contract 5.6).
 * Mocks the SSR auth client and the service-role db client.
 */

let events: FakeEventRow[] = [];
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
  createServiceRoleClient: () => createFakeDb({ events }),
}));

import { GET } from "./route";

function makeRequest(publicId: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/${publicId}/access`, { method: "GET" });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://guestbook.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "role");
  vi.stubEnv("DATABASE_URL", "postgres://x");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "bucket");
  events = [];
  getUser = { ok: true, id: "admin-1" };
  events.push({
    public_id: "evt-1",
    title: "Summer Party",
    status: "ACTIVE",
    created_at: "2026-08-11T12:00:00Z",
    closed_at: null,
    admin_id: "admin-1",
  });
});

describe("GET /api/admin/events/{public_id}/access", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 200 with exactly { public_id, public_url } for an owned event", async () => {
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      public_id: "evt-1",
      public_url: "https://guestbook.example/e/evt-1",
    });
  });

  it("returns 403 FORBIDDEN when the admin does not own the event", async () => {
    events[0].admin_id = "someone-else";
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await GET(makeRequest("evt-missing"), { params: Promise.resolve({ public_id: "evt-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("never leaks the DB PK, admin_id, or storage data", async () => {
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body)).toEqual(["public_id", "public_url"]);
    expect(text).not.toContain("admin_id");
    expect(text).not.toContain("admin-1");
    expect(text).not.toContain("storage");
  });
});