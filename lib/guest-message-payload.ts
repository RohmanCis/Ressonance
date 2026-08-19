import type { NextRequest } from "next/server";

import { logApiError } from "@/lib/api-log";
import type { ExtractResult, SubmissionError } from "@/lib/guest-submission-pipeline";
import { readBoundedBody } from "@/lib/multipart-photo";

/**
 * Guest-message submission payload extraction (API Contract §6.6, Opsi B).
 *
 * JSON body, not multipart: a pre-auth content-type guard
 * (`guardGuestMessagePayload`) plus a post-auth bounded read (4 KB cap — ample
 * for 280 characters), JSON parse, and object-shape check. Text validation
 * (1–280 chars) stays in `submitGuestMessage` (lib/submit-guest-message.ts),
 * the authoritative check; this adapter only moves the route's read/parse
 * plumbing.
 */

/** Hard cap on the buffered JSON body; 4 KB is ample for 280 characters. */
const JSON_BODY_CAP_BYTES = 4 * 1024;

/** Pre-auth content-type guard. Null = pass. */
export function guardGuestMessagePayload(request: NextRequest): SubmissionError | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return {
      status: 400,
      code: "INVALID_REQUEST",
      message: "Content-Type must be application/json.",
    };
  }
  return null;
}

/**
 * Read the bounded JSON body and extract the raw `message_text` value.
 * Validation is delegated to `submitGuestMessage`; extraction never rejects
 * on text content, only on body shape.
 */
export async function extractGuestMessagePayload(
  request: NextRequest,
): Promise<ExtractResult<{ messageText: unknown }>> {
  if (!request.body) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "A JSON body is required.",
    };
  }

  // Bounded read: never buffer beyond 4 KB.
  let raw: string;
  try {
    const body = await readBoundedBody(request.body, JSON_BODY_CAP_BYTES);
    if (!body.ok) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "The request body is too large.",
      };
    }
    raw = new TextDecoder().decode(body.bytes);
  } catch (err) {
    logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "Malformed request body.",
    };
  }

  let parsed: unknown;
  if (raw.trim().length === 0) {
    parsed = {};
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "Malformed JSON request body.",
      };
    }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "Malformed request body.",
    };
  }

  return {
    ok: true,
    payload: { messageText: (parsed as Record<string, unknown>).message_text },
  };
}
