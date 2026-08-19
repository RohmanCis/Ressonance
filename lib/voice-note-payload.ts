import type { NextRequest } from "next/server";

import { loadVoiceNoteFileConfig } from "@/lib/audio-file";
import { logApiError } from "@/lib/api-log";
import type { ExtractResult, SubmissionError } from "@/lib/guest-submission-pipeline";
import {
  extractBoundary,
  extractMultipartFieldBytes,
  multipartBodyCap,
  readBoundedBody,
} from "@/lib/multipart-photo";

/**
 * Voice-note submission payload extraction (API Contract §6.5).
 *
 * Splits the current voice-notes-route body handling into a pre-auth
 * content-type guard (`guardVoiceNotePayload`, never reads the body) and a
 * post-auth bounded body read + `voice_note` field extraction
 * (`extractVoiceNotePayload`). ffprobe format/duration inspection stays in
 * `submitVoiceNote` (the authoritative check, ADR-006) — this adapter only
 * moves the bounded read that previously lived in the route.
 */

/** Pre-auth content-type guard. Null = pass. */
export function guardVoiceNotePayload(request: NextRequest): SubmissionError | null {
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

/** Read the bounded body and extract the single `voice_note` field. */
export async function extractVoiceNotePayload(
  request: NextRequest,
): Promise<ExtractResult<Uint8Array>> {
  const fileConfig = loadVoiceNoteFileConfig();
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
        message: "The audio exceeds the size limit.",
      };
    }
  }
  if (!request.body) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      message: "A 'voice_note' file is required.",
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
        message: "The audio exceeds the size limit.",
      };
    }
    const voiceNote = extractMultipartFieldBytes(body.bytes, "voice_note", boundary);
    if (!voiceNote) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        message: "A 'voice_note' file is required.",
      };
    }
    return { ok: true, payload: voiceNote };
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
