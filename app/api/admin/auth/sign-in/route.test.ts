import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

/**
 * Route-level tests for POST /api/admin/auth/sign-in (API Contract 5.1).
 * The Supabase SSR server client is mocked so the handler runs without a live
 * auth backend; it asserts exact status/body behavior and the absence of any
 * token leakage.
 */

let signInResult:
  | { ok: true; email: string }
  | { ok: false; error: { message: string } }
  | undefined;

vi.mock("@/lib/supabase/server", () => {
  const fakeAuth = {
    signInWithPassword: async () => {
      if (!signInResult || signInResult.ok === false) {
        return {
          data: { user: null, session: null },
          error: signInResult && signInResult.ok === false
            ? signInResult.error
            : { message: "invalid_credentials" },
        };
      }
      return { data: { user: { email: signInResult.email }, session: {} }, error: null };
    },
  };
  return { createClient: async () => ({ auth: fakeAuth }) };
});

import { POST } from "./route";

function makeRequest(body?: unknown, contentType = "application/json") {
  const headers = new Headers();
  headers.set("content-type", `${contentType}; charset=utf-8`);
  return new NextRequest("http://localhost/api/admin/auth/sign-in", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  signInResult = undefined;
});

describe("POST /api/admin/auth/sign-in", () => {
  it("returns 200 with the exact admin shape for valid credentials", async () => {
    signInResult = { ok: true, email: "admin@example.com" };
    const res = await POST(makeRequest({ email: "admin@example.com", password: "secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ admin: { email: "admin@example.com" } });
  });

  it("never returns tokens or session primitives in the response", async () => {
    signInResult = { ok: true, email: "admin@example.com" };
    const res = await POST(makeRequest({ email: "admin@example.com", password: "secret" }));
    const text = await res.text();
    expect(text).not.toMatch(/access_token|refresh_token|session|token|jwt/i);
  });

  it("returns 400 INVALID_REQUEST for malformed JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/admin/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST when Content-Type is not application/json", async () => {
    const res = await POST(makeRequest({ email: "a@b.c", password: "x" }, "text/plain"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST for a missing email", async () => {
    const res = await POST(makeRequest({ password: "x" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST for a missing password", async () => {
    const res = await POST(makeRequest({ email: "a@b.c" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 INVALID_REQUEST for non-string credentials", async () => {
    const res = await POST(makeRequest({ email: 123, password: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 401 AUTHENTICATION_FAILED for invalid credentials", async () => {
    signInResult = { ok: false, error: { message: "invalid_credentials" } };
    const res = await POST(makeRequest({ email: "admin@example.com", password: "wrong" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");
  });
});