import type { NextRequest } from "next/server";

import { logApiError } from "@/lib/api-log";
import type { ExtractResult, SubmissionError } from "@/lib/guest-submission-pipeline";
import {
  extractBoundary,
  extractMultipartFieldBytes,
  multipartBodyCap,
  readBoundedBody,
} from "@/lib/multipart-photo";

/**
 * Shared multipart payload extraction for guest media submissions.
 *
 * Both the photo and voice-note adapters split their route body handling into a
 * pre-auth content-type guard (never reads the body) and a post-auth bounded
 * body read + single-field extraction. The only per-kind differences are the
 * multipart field name, the file-size config source, and the size-limit
 * message; everything else is byte-identical.
 */

export interface MultipartPayloadSpec {
  /** Multipart field name to extract, e.g. "photo" / "voice_note". */
  fieldName: string;
  /** Loads the current byte cap for this media kind. */
  loadMaxSizeBytes: () => number;
  /** 422 FILE_TOO_LARGE message for this media kind. */
  sizeMessage: string;
}

/** Pre-auth content-type guard. Null = pass. */
export function guardMultipartPayload(request: NextRequest): SubmissionError | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return {
      status: 400,
      code: "INVALID_REQUEST",
      message: "Content-Type must be multipart/form-data.",
    };
  }
  return null;
}

/** Read the bounded body and extract the single configured field. */
export function createMultipartPayloadExtractor(
  spec: MultipartPayloadSpec,
): (request: NextRequest) => Promise<ExtractResult<Uint8Array>> {
  return async (request) => {
    const bodyCap = multipartBodyCap(spec.loadMaxSizeBytes());
    const contentType = request.headers.get("content-type") ?? "";

    // Early body-level guard (not vs the file limit) when Content-Length is
    // present; the incremental cap below enforces the same bound while reading.
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const len = Number(contentLength);
      if (Number.isFinite(len) && len > bodyCap) {
        return { ok: false, status: 422, code: "FILE_TOO_LARGE", message: spec.sizeMessage };
      }
    }
    if (!request.body) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: `A '${spec.fieldName}' file is required.`,
      };
    }

    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "Malformed multipart request body.",
      };
    }

    try {
      const body = await readBoundedBody(request.body, bodyCap);
      if (!body.ok) {
        return { ok: false, status: 422, code: "FILE_TOO_LARGE", message: spec.sizeMessage };
      }
      const field = extractMultipartFieldBytes(body.bytes, spec.fieldName, boundary);
      if (!field) {
        return {
          ok: false,
          status: 400,
          code: "INVALID_REQUEST",
          message: `A '${spec.fieldName}' file is required.`,
        };
      }
      return { ok: true, payload: field };
    } catch (err) {
      logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "Malformed multipart request body.",
      };
    }
  };
}
