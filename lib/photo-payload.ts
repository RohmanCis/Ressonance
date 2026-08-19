import type { NextRequest } from "next/server";

import { logApiError } from "@/lib/api-log";
import type { ExtractResult, SubmissionError } from "@/lib/guest-submission-pipeline";
import {
  extractBoundary,
  extractMultipartFieldBytes,
  multipartBodyCap,
  readBoundedBody,
} from "@/lib/multipart-photo";
import { loadPhotoFileConfig } from "@/lib/photo-file";

/**
 * Photo submission payload extraction (API Contract §6.4).
 *
 * Splits the current photos-route body handling into a pre-auth content-type
 * guard (`guardPhotoPayload`, never reads the body) and a post-auth bounded
 * body read + `photo` field extraction (`extractPhotoPayload`). Byte-level
 * limits mirror the route: the total buffered body is capped at the file-size
 * limit + multipart overhead; the authoritative file-size check happens later
 * in `validatePhotoFile` (lib/photo-file.ts).
 */

/** Pre-auth content-type guard. Null = pass. */
export function guardPhotoPayload(request: NextRequest): SubmissionError | null {
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

/**
 * Read the bounded body and extract the single `photo` field.
 * Never trusts the client MIME header — only bytes are extracted here;
 * format approval happens in `validatePhotoFile`.
 */
export async function extractPhotoPayload(
  request: NextRequest,
): Promise<ExtractResult<Uint8Array>> {
  const fileConfig = loadPhotoFileConfig();
  const bodyCap = multipartBodyCap(fileConfig.maxSizeBytes);
  const contentType = request.headers.get("content-type") ?? "";

  // Early body-level guard (not vs the file limit) when Content-Length is
  // present; the incremental cap below enforces the same bound while reading.
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > bodyCap) {
      return {
        ok: false,
        status: 422,
        code: "FILE_TOO_LARGE",
        message: "The image exceeds the size limit.",
      };
    }
  }
  if (!request.body) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "A 'photo' file is required.",
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
      return {
        ok: false,
        status: 422,
        code: "FILE_TOO_LARGE",
        message: "The image exceeds the size limit.",
      };
    }
    const photo = extractMultipartFieldBytes(body.bytes, "photo", boundary);
    if (!photo) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "A 'photo' file is required.",
      };
    }
    return { ok: true, payload: photo };
  } catch (err) {
    logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "Malformed multipart request body.",
    };
  }
}
