import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createFfprobeAudioInspector } from "@/lib/audio-inspector";

const execFileAsync = promisify(execFile);

/**
 * Real-ffprobe smoke test for the inspector (ADR-006). Only meaningful when a
 * real `ffprobe` is on PATH. Otherwise it SKIPS; the injectable interface and
 * controlled fake inspection are what the orchestration tests rely on.
 */
describe("createFfprobeAudioInspector", () => {
  it("returns uninspectable when ffprobe is missing or fails", async () => {
    // A path that cannot possibly be a working ffprobe must yield uninspectable,
    // never throw.
    const inspector = createFfprobeAudioInspector("definitely-not-ffprobe");
    const result = await inspector.inspect(new Uint8Array([0x00, 0x01, 0x02]));
    expect(result.status).toBe("uninspectable");
  });

  it("inspects a real audio file when ffprobe is available", async (ctx) => {
    const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
    try {
      await execFileAsync(ffprobePath, ["-version"]);
    } catch {
      ctx.skip();
      return;
    }
    // Generate a tiny WAV (well over 5s would be impractical; this only checks
    // the inspector parses format_name + duration, not that duration is in range).
    const sampleRate = 8000;
    const seconds = 1;
    const dataBytes = sampleRate * seconds * 2; // 16-bit mono
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataBytes, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataBytes, 40);
    const wav = Buffer.concat([header, Buffer.alloc(dataBytes)]);

    const inspector = createFfprobeAudioInspector(ffprobePath);
    const result = await inspector.inspect(new Uint8Array(wav));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.formatName).toContain("wav");
    expect(result.durationSeconds).toBeGreaterThan(0);
  });
});