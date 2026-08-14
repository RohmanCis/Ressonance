import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

/**
 * Route tests for GET /api/cron/media-cleanup (API Contract §7.1). The
 * service-role client is mocked; the cleanup engine has its own unit tests.
 */

const runMediaCleanup = vi.fn();

vi.mock("@/lib/media-cleanup", async () => {
  const actual = await vi.importActual<typeof import("@/lib/media-cleanup")>("@/lib/media-cleanup");
  return {
    ...actual,
    runMediaCleanup: (...args: Parameters<typeof actual.runMediaCleanup>) => runMediaCleanup(...args),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ tag: "service-role" }),
}));

import { GET } from "./route";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/media-cleanup", { headers });
}

const OK_RESULT = {
  eventsScanned: 1,
  objectsDeleted: 3,
  photosMetadataDeleted: 2,
  voiceNotesMetadataDeleted: 1,
  failures: [],
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "role");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://guestbook.example");
  vi.stubEnv("DATABASE_URL", "postgres://x");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "bucket");
  vi.stubEnv("CRON_SECRET", "cron-secret-1");
  runMediaCleanup.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/media-cleanup", () => {
  it("rejects a request without an authorization header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(runMediaCleanup).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(runMediaCleanup).not.toHaveBeenCalled();
  });

  it("fails closed (500) when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(makeRequest({ authorization: "Bearer anything" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(runMediaCleanup).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("runs cleanup and returns 200 with the summary for the correct secret", async () => {
    runMediaCleanup.mockResolvedValue(OK_RESULT);
    const res = await GET(makeRequest({ authorization: "Bearer cron-secret-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleanup).toEqual({
      eventsScanned: 1,
      objectsDeleted: 3,
      photosMetadataDeleted: 2,
      voiceNotesMetadataDeleted: 1,
    });
    expect(runMediaCleanup).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and logs when cleanup reports failures (no partial success)", async () => {
    runMediaCleanup.mockResolvedValue({
      ...OK_RESULT,
      failures: [{ eventId: "e1", stage: "storage", error: "boom" }],
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(makeRequest({ authorization: "Bearer cron-secret-1" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.cleanup.failures).toBe(1);

      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const entry = JSON.parse(logged.split("\n").find((l: string) => l.includes("media_cleanup_partial_failure"))!);
      expect(entry.event).toBe("media_cleanup_partial_failure");
      expect(entry.correlationId).toBeTruthy();
      // No secrets: the cron secret and auth header never appear in the log.
      expect(logged).not.toContain("cron-secret-1");
      expect(logged.toLowerCase()).not.toContain("authorization");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns 500 INTERNAL_ERROR when cleanup throws", async () => {
    runMediaCleanup.mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(makeRequest({ authorization: "Bearer cron-secret-1" }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("never logs the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await GET(makeRequest({ authorization: "Bearer super-secret-value" }));
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).not.toContain("super-secret-value");
      expect(logged.toLowerCase()).not.toContain("authorization");
      const entry = JSON.parse(logged.split("\n").find((l: string) => l.startsWith("{"))!);
      expect(entry.event).toBe("cron_cleanup_unconfigured");
      expect(entry.path).toBe("/api/cron/media-cleanup");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
