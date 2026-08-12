import { describe, expect, it } from "vitest";

import {
  extractBoundary,
  extractMultipartFieldBytes,
  multipartBodyCap,
  readBoundedBody,
} from "@/lib/multipart-photo";

const BOUNDARY = "----testboundary123";

function jpeg(size = 20): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

function multipartBody(fieldName: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
  );
  const footer = enc.encode(`\r\n--${BOUNDARY}--\r\n`);
  const body = new Uint8Array(header.length + data.length + footer.length);
  body.set(header, 0);
  body.set(data, header.length);
  body.set(footer, header.length + data.length);
  return body;
}

describe("extractBoundary", () => {
  it("parses an unquoted boundary", () => {
    expect(extractBoundary(`multipart/form-data; boundary=${BOUNDARY}`)).toBe(BOUNDARY);
  });

  it("parses a quoted boundary", () => {
    expect(extractBoundary(`multipart/form-data; boundary="${BOUNDARY}"`)).toBe(BOUNDARY);
  });

  it("returns null without a boundary", () => {
    expect(extractBoundary("multipart/form-data")).toBeNull();
  });
});

describe("extractMultipartFieldBytes", () => {
  it("extracts the photo field bytes", () => {
    const body = multipartBody("photo", jpeg(20));
    const out = extractMultipartFieldBytes(body, "photo", BOUNDARY);
    expect(out).not.toBeNull();
    expect(out?.length).toBe(20);
    expect(out?.[0]).toBe(0xff);
    expect(out?.[1]).toBe(0xd8);
  });

  it("returns null when the field is absent", () => {
    const body = multipartBody("other", jpeg());
    expect(extractMultipartFieldBytes(body, "photo", BOUNDARY)).toBeNull();
  });

  it("round-trips byte values above ASCII (magic bytes preserved)", () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd8]);
    const body = multipartBody("photo", data);
    const out = extractMultipartFieldBytes(body, "photo", BOUNDARY);
    expect(out).toEqual(data);
  });

  it("does not truncate content containing a bare boundary marker (not a delimiter line)", () => {
    const enc = new TextEncoder();
    const content = new Uint8Array([
      ...jpeg(8),
      ...enc.encode(`--${BOUNDARY}`),
      ...jpeg(8),
    ]);
    const body = multipartBody("photo", content);
    const out = extractMultipartFieldBytes(body, "photo", BOUNDARY);
    expect(out).toEqual(content);
  });

  it("does not truncate content containing CRLF+boundary not followed by valid closing syntax", () => {
    const enc = new TextEncoder();
    const content = new Uint8Array([
      ...jpeg(8),
      ...enc.encode(`\r\n--${BOUNDARY}XYZ`), // boundary-like line, but not \r\n or --
      ...jpeg(8),
      ...enc.encode(`--${BOUNDARY}`), // bare marker mid-line
      ...jpeg(8),
    ]);
    const body = multipartBody("photo", content);
    const out = extractMultipartFieldBytes(body, "photo", BOUNDARY);
    expect(out).toEqual(content);
  });

  it("still extracts when content ends near the closing delimiter", () => {
    const enc = new TextEncoder();
    const content = new Uint8Array([
      ...jpeg(4),
      ...enc.encode(`\r\n--${BOUNDARY}`), // true-looking boundary hidden mid-content
      0x41,
      0x42,
    ]);
    const body = multipartBody("photo", content);
    const out = extractMultipartFieldBytes(body, "photo", BOUNDARY);
    expect(out).toEqual(content);
  });
});

describe("readBoundedBody", () => {
  it("reads a body within the cap", async () => {
    const bytes = multipartBody("photo", jpeg());
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    });
    const result = await readBoundedBody(stream, multipartBodyCap(1000));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toEqual(bytes);
  });

  it("stops at the cap without reading the whole oversized stream", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(64);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 100) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const result = await readBoundedBody(stream, 128); // cap 128 bytes
    expect(result.ok).toBe(false);
    // Only ~3 chunks were pulled, not the full 100-chunk stream.
    expect(pulls).toBeLessThan(100);
  });
});