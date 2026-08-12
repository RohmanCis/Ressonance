import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { createFakeDb, type FakeEventRow } from "@/test/admin-event-db";

/**
 * Route tests for POST /api/admin/events/{public_id}/close (API Contract 5.5).
 * Mocks the SSR auth client and the service-role db client.
 */

let events: FakeEventRow[] = [];
let updateError: { message?: string } | null = null;
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
  createServiceRoleClient: () => createFakeDb({ events, updateError }),
}));

import { POST } from "./route";

function makeRequest(publicId: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/${publicId}/close`, { method: "POST" });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  events = [];
  updateError = null;
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

describe("POST /api/admin/events/{public_id}/close", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 200 with the updated CLOSED event shape", async () => {
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.status).toBe("CLOSED");
    expect(body.event.closed_at).not.toBeNull();
    expect(body.event.public_id).toBe("evt-1");
  });

  it("returns 403 FORBIDDEN when the admin does not own the event", async () => {
    events[0].admin_id = "someone-else";
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await POST(makeRequest("evt-missing"), { params: Promise.resolve({ public_id: "evt-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 EVENT_ALREADY_CLOSED when the event is not ACTIVE", async () => {
    events[0].status = "CLOSED";
    events[0].closed_at = "2026-08-11T12:30:00Z";
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EVENT_ALREADY_CLOSED");
  });

  it("returns 500 INTERNAL_ERROR on an unexpected db error", async () => {
    updateError = { message: "connection reset" };
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("does not leak the DB PK or admin_id", async () => {
    const res = await POST(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    const text = await res.text();
    expect(text).not.toContain("admin_id");
    expect(text).not.toContain("admin-1");
  });
});