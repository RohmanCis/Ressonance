import { describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { extractGuestMessagePayload, guardGuestMessagePayload } from "@/lib/guest-message-payload";

/**
 * Guest-message payload extraction tests (API Contract §6.6, Opsi B):
 * content-type guard, bounded JSON read, parse/shape checks, and extraction.
 * Text validation (1–280 chars) lives in submitGuestMessage and is covered by
 * lib/submit-guest-message.test.ts — not duplicated here.
 */

function makeRequest(overrides: { contentType?: string; body?: string } = {}) {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? "application/json");
  return new NextRequest("http://localhost/api/events/evt/guest-messages", {
    method: "POST",
    headers,
    body: overrides.body ?? JSON.stringify({ message_text: "Terima kasih!" }),
  });
}

describe("guardGuestMessagePayload", () => {
  it("rejects a non-JSON Content-Type", () => {
    const error = guardGuestMessagePayload(makeRequest({ contentType: "multipart/form-data" }));
    expect(error).not.toBeNull();
    expect(error?.status).toBe(400);
    expect(error?.code).toBe("INVALID_REQUEST");
  });

  it("passes a JSON Content-Type", () => {
    expect(guardGuestMessagePayload(makeRequest())).toBeNull();
  });
});

describe("extractGuestMessagePayload", () => {
  it("extracts the raw message_text value", async () => {
    const result = await extractGuestMessagePayload(
      makeRequest({ body: JSON.stringify({ message_text: "  pesan & kesan  " }) }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.messageText).toBe("  pesan & kesan  ");
  });

  it("returns 400 INVALID_REQUEST for malformed JSON", async () => {
    const result = await extractGuestMessagePayload(makeRequest({ body: "{not json" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_REQUEST");
    }
  });

  it("returns 400 INVALID_REQUEST when the body exceeds the bounded read cap", async () => {
    const result = await extractGuestMessagePayload(makeRequest({ body: "x".repeat(5 * 1024) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_REQUEST");
    }
  });

  it("returns 400 INVALID_REQUEST for a JSON body that is not an object", async () => {
    for (const body of ["42", "[1,2]", "null", "\"str\""]) {
      const result = await extractGuestMessagePayload(makeRequest({ body }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.code).toBe("INVALID_REQUEST");
      }
    }
  });

  it("treats an empty body as an empty object (messageText undefined)", async () => {
    const result = await extractGuestMessagePayload(makeRequest({ body: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.messageText).toBeUndefined();
  });
});
