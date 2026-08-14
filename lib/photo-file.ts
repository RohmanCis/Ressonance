/**
 * Server-side image validation for photo submission (T006).
 *
 * The client MIME header is never trusted; only the actual bytes are inspected
 * (API Contract §6.4). Supports JPEG/PNG/WebP/GIF via magic bytes. Size limit
 * is configurable via env, not a product-policy invention.
 */

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

export type PhotoFileValidation =
  | { status: "ok"; mime: PhotoMimeType }
  | { status: "empty" }
  | { status: "too_large" }
  | { status: "unsupported" };

/** Detect an approved image format from its leading bytes (magic bytes). */
export function detectImageMime(data: Uint8Array): PhotoMimeType | null {
  if (data.length < 12) return null;
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38 &&
    (data[4] === 0x37 || data[4] === 0x39) &&
    data[5] === 0x61
  ) {
    return "image/gif";
  }
  return null;
}

export interface PhotoFileConfig {
  maxSizeBytes: number;
}

/** Load photo file config from environment with a conservative default. */
export function loadPhotoFileConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): PhotoFileConfig {
  // Default fits Vercel's 4.5 MB request-body limit (owner decision 2026-08-15).
  const max = Number(env.PHOTO_MAX_SIZE_BYTES ?? 4_000_000);
  return {
    maxSizeBytes: Number.isFinite(max) && max > 0 ? max : 4_000_000,
  };
}

/**
 * Validate a submitted photo buffer. Empty -> not ok; oversized -> too_large;
 * unrecognized bytes -> unsupported. MIME is derived from bytes only.
 */
export function validatePhotoFile(
  data: Uint8Array,
  config: PhotoFileConfig,
): PhotoFileValidation {
  if (data.length === 0) return { status: "empty" };
  if (data.length > config.maxSizeBytes) return { status: "too_large" };
  const mime = detectImageMime(data);
  if (!mime) return { status: "unsupported" };
  return { status: "ok", mime };
}

/** Approved extension for a detected image MIME type (storage key suffix). */
export function photoExtension(mime: PhotoMimeType): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}