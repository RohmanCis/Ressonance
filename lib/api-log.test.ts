import { afterEach, describe, expect, it, vi } from "vitest";

import { correlationIdFrom, logApiError } from "@/lib/api-log";

/**
 * Unit tests for structured error logging (TECHNICAL_DESIGN.md:219).
 * Verifies single-line JSON emission, correlationId precedence, redaction of
 * cookies/query strings, and safe handling of non-Error thrown values.
 */

function makeRequest(url = "http://localhost/api/events/evt-active/session", headers?: Record<string, string>) {
  return new Request(url, { method: "POST", headers });
}

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  consoleErrorSpy.mockClear();
});

describe("logApiError", () => {
  it("emits a single JSON line with timestamp, level, event, method, pathname-only path, code, message, and stack", () => {
    const request = makeRequest();
    logApiError({
      event: "session_create_failed",
      request,
      code: "INTERNAL_ERROR",
      error: new Error("boom"),
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(typeof line.timestamp).toBe("string");
    expect(new Date(line.timestamp).toString()).not.toBe("Invalid Date");
    expect(line.level).toBe("error");
    expect(line.event).toBe("session_create_failed");
    expect(line.method).toBe("POST");
    expect(line.path).toBe("/api/events/evt-active/session");
    expect(line.code).toBe("INTERNAL_ERROR");
    expect(line.message).toBe("boom");
    expect(typeof line.stack).toBe("string");
    expect(line.stack).toContain("boom");
  });

  it("uses x-request-id over x-vercel-id over a generated UUID", () => {
    const both = makeRequest("http://localhost/api/a", {
      "x-request-id": "req-123",
      "x-vercel-id": "vcl-456",
    });
    expect(correlationIdFrom(both.headers)).toBe("req-123");

    const vercelOnly = makeRequest("http://localhost/api/b", { "x-vercel-id": "vcl-456" });
    expect(correlationIdFrom(vercelOnly.headers)).toBe("vcl-456");

    const none = makeRequest("http://localhost/api/c");
    const generated = correlationIdFrom(none.headers);
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("never logs cookie header values or query strings (pathname-only)", () => {
    const request = makeRequest(
      "http://localhost/api/events/evt-active?token=TOP_SECRET_QUERY&guest_name=Ana",
      { cookie: "guest_session=COOKIE_SECRET_VALUE" },
    );
    logApiError({ event: "session_create_failed", request, code: "INTERNAL_ERROR", error: new Error("x") });

    const output = consoleErrorSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("TOP_SECRET_QUERY");
    expect(output).not.toContain("COOKIE_SECRET_VALUE");
    const line = JSON.parse(output);
    expect(line.path).toBe("/api/events/evt-active");
    expect(line.cookie).toBeUndefined();
  });

  it("handles non-Error thrown values: message = String(value), no stack; no throw on undefined", () => {
    logApiError({ event: "photo_submit_failed", request: makeRequest(), code: "INTERNAL_ERROR", error: "oops" });
    let line = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(line.message).toBe("oops");
    expect(line.stack).toBeUndefined();

    logApiError({ event: "photo_submit_failed", request: makeRequest(), code: "INTERNAL_ERROR", error: undefined });
    line = JSON.parse(consoleErrorSpy.mock.calls[1][0] as string);
    expect(line.message).toBe("undefined");
    expect(line.stack).toBeUndefined();
  });

  it("omits method/path and still logs a correlationId when no request is provided", () => {
    logApiError({ event: "photo_cleanup_failed", error: new Error("delete failed"), context: { storageKey: "k" } });
    const line = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(line.method).toBeUndefined();
    expect(line.path).toBeUndefined();
    expect(line.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line.storageKey).toBe("k");
  });
});
