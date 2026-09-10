import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

/**
 * Route tests for DELETE /api/admin/events/{public_id}/delete (API Contract
 * §5.12). Mocks the SSR auth client, the service-role db, and config. The fake
 * db records an ordered operation log so child-first deletion can be asserted.
 */

interface EventRow {
  id: string;
  public_id: string;
  status: string;
  admin_id: string;
  title: string;
  created_at: string;
  closed_at: string | null;
}
interface SessionRow {
  id: string;
  event_id: string;
}
interface PhotoRow {
  id: string;
  guest_session_id: string;
  storage_key: string;
}
interface VoiceRow {
  id: string;
  guest_session_id: string;
  storage_key: string;
}

interface FakeState {
  events: EventRow[];
  sessions: SessionRow[];
  photos: PhotoRow[];
  voiceNotes: VoiceRow[];
  calls: string[];
  removedKeys: string[];
  selectError: { message?: string } | null;
  deleteError: { message?: string } | null;
  storageError: { message?: string } | null;
}

function createFakeDb(state: FakeState) {
  type Filter = { col: string; val: unknown; inList: boolean };
  type Row = Record<string, unknown>;

  const tableRows = (table: string): Row[] => {
    switch (table) {
      case "events":
        return state.events as unknown as Row[];
      case "guest_sessions":
        return state.sessions as unknown as Row[];
      case "photos":
        return state.photos as unknown as Row[];
      case "voice_notes":
        return state.voiceNotes as unknown as Row[];
      default:
        throw new Error(`unexpected table: ${table}`);
    }
  };

  const setTableRows = (table: string, rows: Row[]) => {
    switch (table) {
      case "events":
        state.events = rows as unknown as EventRow[];
        break;
      case "guest_sessions":
        state.sessions = rows as unknown as SessionRow[];
        break;
      case "photos":
        state.photos = rows as unknown as PhotoRow[];
        break;
      case "voice_notes":
        state.voiceNotes = rows as unknown as VoiceRow[];
        break;
    }
  };

  const matches = (row: Row, filters: Filter[]) =>
    filters.every((f) => (f.inList ? (f.val as unknown[]).includes(row[f.col]) : row[f.col] === f.val));

  const builder = (op: "select" | "delete", table: string, filters: Filter[]) => {
    const execute = async () => {
      state.calls.push(`${op}:${table}`);
      if (op === "select" && state.selectError) return { data: null, error: state.selectError };
      if (op === "delete" && state.deleteError) return { data: null, error: state.deleteError };
      const matched = tableRows(table).filter((r) => matches(r, filters));
      if (op === "delete") {
        setTableRows(table, tableRows(table).filter((r) => !matches(r, filters)));
        return { data: null, error: null };
      }
      return { data: matched, error: null };
    };

    return {
      eq: (col: string, val: unknown) => builder(op, table, [...filters, { col, val, inList: false }]),
      in: (col: string, val: unknown[]) => builder(op, table, [...filters, { col, val, inList: true }]),
      maybeSingle: async () => {
        state.calls.push(`${op}:${table}`);
        if (op === "select" && state.selectError) return { data: null, error: state.selectError };
        const matched = tableRows(table).filter((r) => matches(r, filters));
        return { data: matched[0] ?? null, error: null };
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
  };

  return {
    from(table: string) {
      return {
        select: (_cols: string) => builder("select", table, []),
        delete: () => builder("delete", table, []),
      };
    },
    storage: {
      from: (_bucket: string) => ({
        remove: async (keys: string[]) => {
          state.calls.push("storage:remove");
          state.removedKeys.push(...keys);
          if (state.storageError) return { data: null, error: state.storageError };
          return { data: null, error: null };
        },
      }),
    },
  };
}

let state: FakeState;
let getUser: { ok: true; id: string } | { ok: false } = { ok: false };

vi.mock("@/lib/config", () => ({
  getServerConfig: () => ({ supabaseStorageBucket: "test-bucket" }),
}));

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
  createServiceRoleClient: () => createFakeDb(state),
}));

import { DELETE } from "./route";

function makeRequest(publicId: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/events/${publicId}/delete`, { method: "DELETE" });
}

function seed(): FakeState {
  return {
    events: [
      {
        id: "event-uuid-1",
        public_id: "evt-1",
        status: "CLOSED",
        admin_id: "admin-1",
        title: "Summer Party",
        created_at: "2026-08-11T12:00:00Z",
        closed_at: "2026-08-11T12:30:00Z",
      },
    ],
    sessions: [{ id: "session-1", event_id: "event-uuid-1" }],
    photos: [{ id: "photo-1", guest_session_id: "session-1", storage_key: "events/event-uuid-1/sessions/session-1/photos/p1.jpg" }],
    voiceNotes: [{ id: "voice-1", guest_session_id: "session-1", storage_key: "events/event-uuid-1/sessions/session-1/voice-notes/v1.webm" }],
    calls: [],
    removedKeys: [],
    selectError: null,
    deleteError: null,
    storageError: null,
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  state = seed();
  getUser = { ok: true, id: "admin-1" };
});

describe("DELETE /api/admin/events/{public_id}/delete", () => {
  it("returns 401 AUTHENTICATION_REQUIRED without a valid session", async () => {
    getUser = { ok: false };
    const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await DELETE(makeRequest("evt-missing"), { params: Promise.resolve({ public_id: "evt-missing" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 403 FORBIDDEN when the admin does not own the event", async () => {
    state.events[0].admin_id = "someone-else";
    const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("returns 403 FORBIDDEN with a close-first message for an ACTIVE event", async () => {
    state.events[0].status = "ACTIVE";
    state.events[0].closed_at = null;
    const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Active event cannot be deleted. Close it first.");
    expect(state.removedKeys).toEqual([]);
    expect(state.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
  });

  it("deletes storage objects then child-first DB rows and returns 200 {deleted:true}", async () => {
    const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    expect(state.removedKeys).toEqual([
      "events/event-uuid-1/sessions/session-1/photos/p1.jpg",
      "events/event-uuid-1/sessions/session-1/voice-notes/v1.webm",
    ]);
    expect(state.calls.filter((c) => c === "storage:remove" || c.startsWith("delete:"))).toEqual([
      "storage:remove",
      "delete:photos",
      "delete:voice_notes",
      "delete:guest_sessions",
      "delete:events",
    ]);
    expect(state.events).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
    expect(state.photos).toHaveLength(0);
    expect(state.voiceNotes).toHaveLength(0);
  });

  it("returns 500 and leaves DB rows intact when storage removal fails", async () => {
    state.storageError = { message: "storage down" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
      expect(state.events).toHaveLength(1);
      expect(state.sessions).toHaveLength(1);
      expect(state.photos).toHaveLength(1);
      expect(state.voiceNotes).toHaveLength(1);
      expect(state.calls.filter((c) => c.startsWith("delete:"))).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns 500 INTERNAL_ERROR when a DB delete fails", async () => {
    state.deleteError = { message: "connection reset" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("deletes an event with no guest sessions without touching child tables", async () => {
    state.sessions = [];
    state.photos = [];
    state.voiceNotes = [];
    const res = await DELETE(makeRequest("evt-1"), { params: Promise.resolve({ public_id: "evt-1" }) });
    expect(res.status).toBe(200);
    expect(state.calls.filter((c) => c.startsWith("delete:"))).toEqual(["delete:events"]);
    expect(state.removedKeys).toEqual([]);
  });
});
