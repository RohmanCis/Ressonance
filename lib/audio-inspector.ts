import "server-only";

import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Server-side audio inspection via ffprobe (ADR-006 / TECHNICAL_DESIGN §7).
 *
 * The real implementation writes the submitted bytes to a temp file in
 * `os.tmpdir()`, runs `ffprobe -v quiet -print_format json -show_format
 * -show_streams -i <path>`, and parses `format.duration` (float seconds) and
 * `format.format_name`. Any file containing a video stream is rejected as
 * `uninspectable` — the container format_name alone cannot distinguish
 * audio-only from video MP4/WebM (same container), so the stream codec_type
 * is the authoritative video guard (API Contract §7: audio-only). Any failure
 * — missing ffprobe, non-zero exit, JSON parse error, missing duration —
 * also yields `uninspectable`. The temp file is always unlinked in a `finally`.
 * Injection keeps tests free of a real ffprobe dependency.
 */

export type AudioInspection =
  | { status: "uninspectable" }
  | { status: "ok"; durationSeconds: number; formatName: string };

export interface AudioInspector {
  inspect(data: Uint8Array): Promise<AudioInspection>;
}

/** FFPROBE_PATH default and the execution timeout guard (TD §7 §15.4). */
export const FFPROBE_TIMEOUT_MS = 15_000;

interface FfprobeStream {
  codec_type?: string;
}

interface FfprobeOutput {
  format?: { duration?: string; format_name?: string };
  streams?: FfprobeStream[];
}

function runFfprobe(ffprobePath: string, file: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobePath,
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", "-i", file],
      { timeout: FFPROBE_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout) as FfprobeOutput);
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

export function createFfprobeAudioInspector(ffprobePath: string): AudioInspector {
  return {
    async inspect(data) {
      const file = join(
        tmpdir(),
        `voice-note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      try {
        await writeFile(file, data);
        const parsed = await runFfprobe(ffprobePath, file);
        const durationRaw = parsed?.format?.duration;
        const formatName = parsed?.format?.format_name;
        if (durationRaw === undefined || formatName === undefined) {
          return { status: "uninspectable" };
        }
        // Reject video containers — a voice note must be audio-only (API
        // Contract §7). The container format_name alone cannot distinguish
        // audio-only from video MP4/WebM (same container), so the stream
        // codec_type is the authoritative check.
        const hasVideoStream = (parsed?.streams ?? []).some(
          (s) => s.codec_type === "video",
        );
        if (hasVideoStream) return { status: "uninspectable" };
        const duration = Number(durationRaw);
        if (!Number.isFinite(duration) || duration < 0) {
          return { status: "uninspectable" };
        }
        return { status: "ok", durationSeconds: duration, formatName };
      } catch {
        return { status: "uninspectable" };
      } finally {
        await unlink(file).catch(() => undefined);
      }
    },
  };
}