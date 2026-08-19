import { describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { extractVoiceNotePayload, guardVoiceNotePayload } from "@/lib/voice-note-payload";

/**
 * Voice-note payload extraction tests (API Contract §6.5): content-type
 * guard, field presence, bounded body cap, and successful extraction. ffprobe
 * format/duration authority is covered by lib/audio-inspector.test.ts and
 * submit-voice-note.test.ts — not duplicated here.
 */

const BOUNDARY = "----testboundary123";

function multipartBody(fieldName: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="note.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
  );
  const footer = enc.encode(`\r\n--${BOUNDARY}--\r\n`);
  const body = new Uint8Array(header.length + data.length + footer.length);
  body.set(header, 0);
  body.set(data, header.length);
  body.set(footer, header.length + data.length);
  return body;
}

function makeRequest(overrides: { contentType?: string; dataSize?: number; field?: boolean } = {}) {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? `multipart/form-data; boundary=${BOUNDARY}`);
  const data = new Uint8Array(overrides.dataSize ?? 40).fill(0x41);
  const body = overrides.field === false ? multipartBody("other", data) : multipartBody("voice_note", data);
  return new NextRequest("http://localhost/api/events/evt/voice-notes", {
    method: "POST",
    headers,
    body: body.buffer as ArrayBuffer,
  });
}

describe("guardVoiceNotePayload", () => {
  it("rejects a non-multipart Content-Type", () => {
    const error = guardVoiceNotePayload(makeRequest({ contentType: "application/json" }));
    expect(error).not.toBeNull();
    expect(error?.status).toBe(400);
    expect(error?.code).toBe("INVALID_REQUEST");
  });

  it("passes a multipart Content-Type", () => {
    expect(guardVoiceNotePayload(makeRequest())).toBeNull();
  });
});

describe("extractVoiceNotePayload", () => {
  it("extracts the voice_note field bytes", async () => {
    const result = await extractVoiceNotePayload(makeRequest({ dataSize: 30 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.length).toBe(30);
  });

  it("returns 400 INVALID_REQUEST when the voice_note field is missing", async () => {
    const result = await extractVoiceNotePayload(makeRequest({ field: false }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("INVALID_REQUEST");
    }
  });

  it("returns 422 FILE_TOO_LARGE when the total body exceeds the bounded cap", async () => {
    // The extract only guards the total body (file limit + multipart overhead);
    // the authoritative per-file size check runs later in validateVoiceNoteFile.
    vi.stubEnv("VOICE_NOTE_MAX_SIZE_BYTES", "100");
    const result = await extractVoiceNotePayload(makeRequest({ dataSize: 70_000 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("FILE_TOO_LARGE");
    }
    vi.stubEnv("VOICE_NOTE_MAX_SIZE_BYTES", undefined);
  });
});
