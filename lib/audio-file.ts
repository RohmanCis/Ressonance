/**
 * Server-side audio validation for voice-note submission (T007).
 *
 * The client MIME header and the browser recording timer are never trusted;
 * format approval and duration are decided by a server-side `ffprobe`
 * inspection (ADR-006 / TECHNICAL_DESIGN §6–7). This module only performs the
 * empty/size pre-check before spawning ffprobe and maps an inspected ffprobe
 * `format_name` to an approved MIME type. Size limit is configurable via env.
 */

export const VOICE_NOTE_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
] as const;

export type VoiceNoteMimeType = (typeof VOICE_NOTE_MIME_TYPES)[number];

/** Accepted voice-note duration range, inclusive (db_scheme §5 CHECK). */
export const VOICE_DURATION_MIN = 5;
export const VOICE_DURATION_MAX = 30;

export type VoiceNoteFileValidation =
  | { status: "ok" }
  | { status: "empty" }
  | { status: "too_large" };

export interface VoiceNoteFileConfig {
  maxSizeBytes: number;
}

/** Load voice-note file config from environment with a conservative default. */
export function loadVoiceNoteFileConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): VoiceNoteFileConfig {
  const max = Number(env.VOICE_NOTE_MAX_SIZE_BYTES ?? 25_000_000);
  return {
    maxSizeBytes: Number.isFinite(max) && max > 0 ? max : 25_000_000,
  };
}

/**
 * Pre-check a submitted voice-note buffer: empty -> not ok; oversized ->
 * too_large. No magic-byte check — ffprobe is the authority for format
 * (ADR-006); this keeps the maintenance surface minimal.
 */
export function validateVoiceNoteFile(
  data: Uint8Array,
  config: VoiceNoteFileConfig,
): VoiceNoteFileValidation {
  if (data.length === 0) return { status: "empty" };
  if (data.length > config.maxSizeBytes) return { status: "too_large" };
  return { status: "ok" };
}

/**
 * Map an ffprobe `format.format_name` (e.g. "webm", "ogg", "mov,mp4,m4a")
 * to an approved MIME type. Returns null for any other parseable format.
 */
export function ffprobeFormatToMime(formatName: string): VoiceNoteMimeType | null {
  const f = formatName.toLowerCase();
  if (f.includes("webm")) return "audio/webm";
  if (f.includes("ogg")) return "audio/ogg";
  if (f.includes("mp4") || f.includes("mov")) return "audio/mp4";
  return null;
}

/** Approved extension for a voice-note MIME type (storage key suffix). */
export function voiceNoteExtension(mime: VoiceNoteMimeType): string {
  switch (mime) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
  }
}