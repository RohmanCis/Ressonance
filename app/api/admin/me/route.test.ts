import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for GET /api/admin/me (API Contract 5.2). The Supabase SSR
 * server client is mocked so the handler runs without a live auth backend; it
 * asserts exact 200/401 behavior and absent session leakage.
 */

let getUserResult:
  | { ok: true; email: string }
  | { ok: false; error: { message: string } }
  | undefined;

vi.mock("@/lib/supabase/server", () => {
  const fakeAuth = {
    getUser: async () => {
      if (!getUserResult || getUserResult.ok === false) {
        return {
          data: { user: null },
          error: getUserResult && getUserResult.ok === false
            ? getUserResult.error
            : { message: "Auth session missing!" },
        };
      }
      return { data: { user: { email: getUserResult.email } }, error: null };
    },
  };
  return { createClient: async () => ({ auth: fakeAuth }) };
});

import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  getUserResult = undefined;
});

describe("GET /api/admin/me", () => {
  it("returns 200 with the exact admin shape for a valid session", async () => {
    getUserResult = { ok: true, email: "admin@example.com" };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ admin: { email: "admin@example.com" } });
  });

  it("returns 200 with the session email even when it differs from any input", async () => {
    getUserResult = { ok: true, email: "owner@example.com" };
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ admin: { email: "owner@example.com" } });
  });

  it("returns 401 AUTHENTICATION_REQUIRED for a missing session", async () => {
    getUserResult = undefined;
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("returns 401 AUTHENTICATION_REQUIRED for an invalid/expired session", async () => {
    getUserResult = { ok: false, error: { message: "JWT expired" } };
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("never leaks tokens or session primitives", async () => {
    getUserResult = { ok: true, email: "admin@example.com" };
    const res = await GET();
    const text = await res.text();
    expect(text).not.toMatch(/access_token|refresh_token|session|token|jwt/i);
  });
});