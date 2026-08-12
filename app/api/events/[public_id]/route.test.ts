import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

/**
 * Route-level tests for GET /api/events/{public_id} (API Contract 6.1).
 * The Supabase service-role client is mocked so the handler runs without a
 * live DB; the real DB is verified by the integration suite.
 */

let events: { id: string; public_id: string; title: string; status: string }[] = [];

const makeDb = () => {
  return {
    from(table: string) {
      if (table !== "events") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            eq(_col: string, value: string) {
              return {
                maybeSingle: async () => {
                  const hit = events.find((e) => e.public_id === value);
                  return hit ? { data: hit, error: null } : { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
};

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => makeDb(),
}));

import { GET } from "./route";

function makeRequest(publicId: string) {
  return new NextRequest(`http://localhost/api/events/${publicId}`, { method: "GET" });
}

beforeEach(() => {
  events = [
    { id: "event-1", public_id: "evt-active", title: "Active Party", status: "ACTIVE" },
    { id: "event-2", public_id: "evt-closed", title: "Old Party", status: "CLOSED" },
    { id: "event-3", public_id: "evt-archived", title: "Gone Party", status: "ARCHIVED" },
  ];
});

describe("GET /api/events/{public_id}", () => {
  it("returns 200 with the exact event shape for an ACTIVE event", async () => {
    const res = await GET(makeRequest("evt-active"), {
      params: Promise.resolve({ public_id: "evt-active" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      event: { public_id: "evt-active", title: "Active Party", status: "ACTIVE" },
    });
  });

  it("returns 200 for a CLOSED event so guests can still view it", async () => {
    const res = await GET(makeRequest("evt-closed"), {
      params: Promise.resolve({ public_id: "evt-closed" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.status).toBe("CLOSED");
  });

  it("returns 404 NOT_FOUND for an unknown event", async () => {
    const res = await GET(makeRequest("evt-missing"), {
      params: Promise.resolve({ public_id: "evt-missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for an ARCHIVED (not guest-accessible) event", async () => {
    const res = await GET(makeRequest("evt-archived"), {
      params: Promise.resolve({ public_id: "evt-archived" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("never sets a cookie on the response", async () => {
    const res = await GET(makeRequest("evt-active"), {
      params: Promise.resolve({ public_id: "evt-active" }),
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not leak the database PK or extra columns", async () => {
    const res = await GET(makeRequest("evt-active"), {
      params: Promise.resolve({ public_id: "evt-active" }),
    });
    const text = await res.text();
    const body = JSON.parse(text);
    expect(Object.keys(body.event)).toEqual(["public_id", "title", "status"]);
    expect(text).not.toContain("event-1");
    expect(text).not.toContain("created_at");
    expect(text).not.toContain("storage_key");
  });
});