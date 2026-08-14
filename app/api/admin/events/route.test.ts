import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { createFakeDb, type FakeEventRow } from "@/test/admin-event-db";

/**
 * Route tests for POST /api/admin/events (API Contract 5.3). The Supabase SSR
 * server client (auth) and the service-role client (db) are mocked so the
 * handler runs without a live backend.
 */

let events: FakeEventRow[] = [];
let insertError: { message?: string } | null = null;
let selectError: { message?: string } | null = null;
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
  createServiceRoleClient: () => createFakeDb({ events, insertError, selectError }),
}));

import { GET, POST } from "./route";

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  insertError = null;
  selectError = null;
  getUser = { ok: true, id: "admin-1" };
});

describe("POST /api/admin/events", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await POST(makeRequest({ title: "Summer Party" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 201 with the exact event shape and public_url", async () => {
    const res = await POST(makeRequest({ title: "Summer Party" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.title).toBe("Summer Party");
    expect(body.event.status).toBe("ACTIVE");
    expect(body.event.closed_at).toBeNull();
    expect(body.public_url).toMatch(/^https:\/\/guestbook\.example\/e\/[A-Za-z0-9_-]+$/);
    expect(body.public_url).toContain(body.event.public_id);
  });

  it("generates an opaque non-sequential public_id (no DB PK/admin_id leak)", async () => {
    const res = await POST(makeRequest({ title: "Summer Party" }));
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.event.public_id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(text).not.toContain("admin_id");
    expect(text).not.toContain("admin-1");
    expect(text).not.toContain('"id"');
  });

  it("returns 400 INVALID_INPUT for a missing title", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.fields.title).toBe("Title is required.");
  });

  it("returns 400 INVALID_INPUT for a blank or non-string title", async () => {
    for (const title of ["", "   ", 123, null]) {
      const res = await POST(makeRequest({ title }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_INPUT");
    }
  });

  it("returns 400 INVALID_INPUT for malformed JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/admin/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("returns 409 ACTIVE_EVENT_EXISTS when the admin already has an ACTIVE event", async () => {
    insertError = { message: 'duplicate key value violates unique constraint "uq_events_one_active_per_admin"' };
    const res = await POST(makeRequest({ title: "Second Party" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ACTIVE_EVENT_EXISTS");
    expect(events).toHaveLength(0);
  });

  it("returns 500 INTERNAL_ERROR on an unexpected db error", async () => {
    insertError = { message: "connection reset" };
    const res = await POST(makeRequest({ title: "Summer Party" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("GET /api/admin/events", () => {
  function seed(rows: FakeEventRow[]) {
    events.push(...rows);
  }

  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 200 with the admin's events, newest first, no admin_id/PK leak", async () => {
    seed([
      {
        public_id: "evt-old",
        title: "Old Party",
        status: "CLOSED",
        created_at: "2026-08-01T10:00:00Z",
        closed_at: "2026-08-02T10:00:00Z",
        admin_id: "admin-1",
      },
      {
        public_id: "evt-new",
        title: "Summer Party",
        status: "ACTIVE",
        created_at: "2026-08-10T12:00:00Z",
        closed_at: null,
        admin_id: "admin-1",
      },
      {
        public_id: "evt-other",
        title: "Not Mine",
        status: "ACTIVE",
        created_at: "2026-08-11T12:00:00Z",
        closed_at: null,
        admin_id: "admin-2",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(body.events.map((e: { public_id: string }) => e.public_id)).toEqual(["evt-new", "evt-old"]);
    expect(body.events[0]).toEqual({
      public_id: "evt-new",
      title: "Summer Party",
      status: "ACTIVE",
      created_at: "2026-08-10T12:00:00Z",
      closed_at: null,
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("admin_id");
    expect(text).not.toContain("admin-2");
    expect(text).not.toContain('"id"');
  });

  it("returns 200 with an empty events array when the admin has no events", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ events: [] });
  });

  it("returns 500 INTERNAL_ERROR when the db query fails", async () => {
    selectError = { message: "connection reset" };
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});