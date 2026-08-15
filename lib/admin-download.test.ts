import { describe, expect, it } from "vitest";
import {
  describeDownloadResponse,
  downloadErrorCode,
  downloadErrorCodeFromResponse,
  downloadErrorMessage,
} from "@/lib/admin-download";

describe("downloadErrorMessage code mapping", () => {
  it("maps auth errors to session-expired guidance", () => {
    expect(downloadErrorMessage("AUTHENTICATION_REQUIRED")).toBe("Your session may have expired. Sign in again.");
    expect(downloadErrorMessage("AUTHENTICATION_FAILED")).toBe("Your session may have expired. Sign in again.");
  });

  it("maps FORBIDDEN and NOT_FOUND to unavailable media", () => {
    expect(downloadErrorMessage("FORBIDDEN")).toBe("This media is no longer available.");
    expect(downloadErrorMessage("NOT_FOUND")).toBe("This media is no longer available.");
  });

  it("maps MEDIA_ACCESS_FAILED and INTERNAL_ERROR to generic retry guidance", () => {
    expect(downloadErrorMessage("MEDIA_ACCESS_FAILED")).toBe("Download failed. Try again.");
    expect(downloadErrorMessage("INTERNAL_ERROR")).toBe("Download failed. Try again.");
  });

  it("defaults unknown and missing codes", () => {
    expect(downloadErrorMessage("UNKNOWN_CODE")).toBe("Download failed. Try again.");
    expect(downloadErrorMessage(undefined)).toBe("Download failed. Try again.");
  });
});

describe("describeDownloadResponse", () => {
  it("treats 2xx as ok", () => {
    expect(describeDownloadResponse(200)).toBe("ok");
    expect(describeDownloadResponse(206)).toBe("ok");
  });

  it("treats error statuses as error", () => {
    expect(describeDownloadResponse(401)).toBe("error");
    expect(describeDownloadResponse(403)).toBe("error");
    expect(describeDownloadResponse(404)).toBe("error");
    expect(describeDownloadResponse(500)).toBe("error");
    expect(describeDownloadResponse(502)).toBe("error");
  });
});

describe("downloadErrorCode", () => {
  it("reads the code from the error envelope", () => {
    expect(downloadErrorCode(404, { error: { code: "NOT_FOUND" } })).toBe("NOT_FOUND");
  });

  it("falls back to INTERNAL_ERROR for malformed bodies", () => {
    expect(downloadErrorCode(500, null)).toBe("INTERNAL_ERROR");
    expect(downloadErrorCode(500, {})).toBe("INTERNAL_ERROR");
    expect(downloadErrorCode(500, { error: {} })).toBe("INTERNAL_ERROR");
    expect(downloadErrorCode(500, { error: { code: 42 } })).toBe("INTERNAL_ERROR");
  });

  it("keeps AUTHENTICATION_REQUIRED when a 401 lacks a parseable code", () => {
    expect(downloadErrorCode(401, {})).toBe("AUTHENTICATION_REQUIRED");
  });
});

describe("downloadErrorCodeFromResponse", () => {
  it("non-JSON body -> INTERNAL_ERROR (default message path)", async () => {
    const res = new Response("not json", { status: 502 });
    expect(await downloadErrorCodeFromResponse(res)).toBe("INTERNAL_ERROR");
    expect(downloadErrorMessage(await downloadErrorCodeFromResponse(res))).toBe("Download failed. Try again.");
  });

  it("parses a JSON error envelope", async () => {
    const res = new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
    expect(await downloadErrorCodeFromResponse(res)).toBe("FORBIDDEN");
  });
});
