import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAdminEvents } from "@/lib/admin-event-repo";
import { createFakeDb, type FakeEventRow } from "@/test/admin-event-db";

/**
 * Repository tests for listAdminEvents (API Contract §5.10). The service-role
 * client is replaced with the shared in-memory fake so the query chain runs
 * without a live backend.
 */

const asDb = (db: ReturnType<typeof createFakeDb>) => db as unknown as SupabaseClient;

function row(overrides: Partial<FakeEventRow>): FakeEventRow {
  return {
    public_id: "evt-1",
    title: "Summer Party",
    status: "ACTIVE",
    created_at: "2026-08-10T12:00:00Z",
    closed_at: null,
    admin_id: "admin-1",
    ...overrides,
  };
}

describe("listAdminEvents", () => {
  it("returns only the admin's events, newest first", async () => {
    const db = createFakeDb({
      events: [
        row({ public_id: "evt-old", created_at: "2026-08-01T10:00:00Z", status: "CLOSED" }),
        row({ public_id: "evt-new", created_at: "2026-08-10T12:00:00Z" }),
        row({ public_id: "evt-other", admin_id: "admin-2", created_at: "2026-08-11T12:00:00Z" }),
      ],
    });
    const rows = await listAdminEvents(asDb(db), "admin-1");
    expect(rows.map((e) => e.public_id)).toEqual(["evt-new", "evt-old"]);
  });

  it("returns an empty array when the admin has no events", async () => {
    const db = createFakeDb({ events: [row({ admin_id: "admin-2" })] });
    const rows = await listAdminEvents(asDb(db), "admin-1");
    expect(rows).toEqual([]);
  });

  it("returns the Event shape without admin_id or the DB pk", async () => {
    const db = createFakeDb({ events: [row({ closed_at: "2026-08-02T10:00:00Z" })] });
    const rows = await listAdminEvents(asDb(db), "admin-1");
    expect(rows[0]).toEqual({
      public_id: "evt-1",
      title: "Summer Party",
      status: "ACTIVE",
      created_at: "2026-08-10T12:00:00Z",
      closed_at: "2026-08-02T10:00:00Z",
    });
    expect(JSON.stringify(rows)).not.toContain("admin_id");
  });

  it("throws when the db query fails", async () => {
    const db = createFakeDb({ events: [], selectError: { message: "connection reset" } });
    await expect(listAdminEvents(asDb(db), "admin-1")).rejects.toThrow("connection reset");
  });
});
