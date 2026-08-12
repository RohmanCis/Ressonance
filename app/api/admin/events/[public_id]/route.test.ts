import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { createFakeDb, type FakeEventRow } from "@/test/admin-event-db";

/**
 * Route tests for GET /api/admin/events/{public_id} (API Contract 5.4).
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
  return new NextRequest(`http://localhost/api/admin/events/${publicId}`, { method: "GET" });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
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

describe("GET /api/admin/events/{public_id}", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 200 with the exact Event shape for an owned event", async () => {
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      event: {
        public_id: "evt-1",
        title: "Summer Party",
        status: "ACTIVE",
        created_at: "2026-08-11T12:00:00Z",
        closed_at: null,
      },
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

  it("does not leak the DB PK or admin_id", async () => {
    const res = await GET(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body.event)).toEqual(["public_id", "title", "status", "created_at", "closed_at"]);
    expect(text).not.toContain("admin_id");
    expect(text).not.toContain("admin-1");
  });
});