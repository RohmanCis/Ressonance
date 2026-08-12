/**
 * Minimal bounded multipart handling for photo uploads (T006 / QA-3).
 *
 * Native Web APIs only (ReadableStream, TextDecoder) — no dependency. The
 * request body is read incrementally with a hard byte cap so we never buffer
 * beyond `maxSizeBytes + MULTIPART_OVERHEAD_ALLOWANCE`. A single `photo` field
 * is then extracted from the (bounded) buffered body by scanning for its
 * `name="photo"` header and the closing boundary.
 *
 * Limitation: this is a minimal parser for the contract's single `photo` field.
 * It does not fully tokenize arbitrary multipart bodies; a `photo` field with a
 * body containing the boundary sequence is not supported (unrealistic for
 * images). Total body size is bounded by the cap; the authoritative file size
 * limit is enforced on the extracted photo bytes.
 */

/** Bytes permitted beyond the photo file size for headers/boundary/other fields. */
export const MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024;

/** Hard cap on the buffered multipart body for a given file-size limit. */
export function multipartBodyCap(maxSizeBytes: number): number {
  return maxSizeBytes + MULTIPART_OVERHEAD_ALLOWANCE;
}

/** Extract the multipart `boundary` token from a Content-Type header. */
export function extractBoundary(contentType: string): string | null {
  const m = /\bboundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const b = m?.[1] ?? m?.[2];
  return b ? b.trim() : null;
}

function indexOfSubarray(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function lastIndexOfSubarray(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  for (let i = Math.min(from, haystack.length - needle.length); i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

const CR = 0x0d;
const LF = 0x0a;
const DASH = 0x2d;

/** True when `i` is at the start of a line (position 0 or after CRLF). */
function isLineStart(body: Uint8Array, i: number): boolean {
  return i === 0 || (body[i - 1] === LF && body[i - 2] === CR);
}

/**
 * Extract the bytes of the first part whose header contains `name="<fieldName>"`.
 * Returns null when the part is absent or the body is malformed.
 *
 * Delimiter-aware (QA-4): a closing now requires a COMPLETE delimiter line —
 * `\r\n--boundary` where the boundary is at a valid line start and the line ends
 * with `\r\n` (next part) or `--` (final close). Boundary-like byte sequences
 * inside binary content that do not form a full delimiter line are skipped, so
 * they never truncate an accepted payload. Byte-level scanning preserves all
 * byte values (no text-encoding round-trip).
 */
export function extractMultipartFieldBytes(
  body: Uint8Array,
  fieldName: string,
  boundary: string,
): Uint8Array | null {
  const enc = new TextEncoder();
  const open = enc.encode(`--${boundary}`);
  const close = enc.encode(`\r\n--${boundary}`);
  const target = enc.encode(`name="${fieldName}"`);
  const delim = enc.encode("\r\n\r\n");

  const nameIdx = indexOfSubarray(body, target, 0);
  if (nameIdx === -1) return null;

  // Locate the part's opening delimiter line: `--boundary` at a line start,
  // immediately followed by CRLF, and positioned before the field name.
  let partStart = lastIndexOfSubarray(body, open, nameIdx);
  while (partStart !== -1 && !isOpeningDelimiter(body, partStart, open.length)) {
    if (partStart === 0) {
      partStart = -1;
      break;
    }
    partStart = lastIndexOfSubarray(body, open, partStart - 1);
  }
  if (partStart === -1) return null;

  const headerEnd = indexOfSubarray(body, delim, partStart);
  // The field name must appear inside this part's header, before the delimiter.
  if (headerEnd === -1 || nameIdx > headerEnd) return null;

  const contentStart = headerEnd + delim.length;

  // Find the closing delimiter line, skipping boundary-like bytes inside the
  // content that do not form a complete delimiter line.
  let contentEnd = -1;
  let pos = contentStart;
  for (;;) {
    const c = indexOfSubarray(body, close, pos);
    if (c === -1) break;
    if (isClosingDelimiter(body, c, open.length)) {
      contentEnd = c;
      break;
    }
    pos = c + 1;
  }
  if (contentEnd === -1) return null;

  return body.slice(contentStart, contentEnd);
}

/** `--boundary` at a valid line start immediately followed by CRLF. */
function isOpeningDelimiter(body: Uint8Array, i: number, boundaryLen: number): boolean {
  if (!isLineStart(body, i)) return false;
  const after = i + boundaryLen;
  return body[after] === CR && body[after + 1] === LF;
}

/** `\r\n--boundary` line ending in CRLF (next part) or `--` (final close). */
function isClosingDelimiter(body: Uint8Array, i: number, boundaryLen: number): boolean {
  const after = i + 2 + boundaryLen;
  const a = body[after];
  if (a === CR && body[after + 1] === LF) return true;
  if (a === DASH && body[after + 1] === DASH) return true;
  return false;
}

/**
 * Read a Web ReadableStream with a hard byte cap. Returns `ok: false` as soon
 * as `maxBytes` is exceeded, so an oversized body is never fully buffered.
 */
export async function readBoundedBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      total += value.length;
      if (total > maxBytes) return { ok: false };
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  return { ok: true, bytes };
}