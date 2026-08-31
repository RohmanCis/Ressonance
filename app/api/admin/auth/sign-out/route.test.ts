import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

/**
 * Route-level tests for POST /api/admin/auth/sign-out (API Contract 5.11).
 * The Supabase SSR server client is mocked so the handler runs without a live
 * auth backend; it asserts exact status/body behavior and that signOut is
 * invoked only for valid sessions.
 */

let getUserResult: { ok: true } | { ok: false } | undefined;
let signOutCalls = 0;

vi.mock("@/lib/supabase/server", () => {
  const fakeAuth = {
    getUser: async () => {
      if (!getUserResult || getUserResult.ok === false) {
        return { data: { user: null }, error: { message: "no session" } };
      }
      return { data: { user: { email: "admin@example.com" } }, error: null };
    },
    signOut: async () => {
      signOutCalls += 1;
      return { error: null };
    },
  };
  return { createClient: async () => ({ auth: fakeAuth }) };
});

import { POST } from "./route";

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/auth/sign-out", { method: "POST" });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getUserResult = undefined;
  signOutCalls = 0;
});

describe("POST /api/admin/auth/sign-out", () => {
  it("returns 200 { signed_out: true } for a valid session and calls signOut", async () => {
    getUserResult = { ok: true };
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signed_out: true });
    expect(signOutCalls).toBe(1);
  });

  it("returns 401 AUTHENTICATION_REQUIRED when getUser fails and does not call signOut", async () => {
    getUserResult = { ok: false };
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." },
    });
    expect(signOutCalls).toBe(0);
  });
});
