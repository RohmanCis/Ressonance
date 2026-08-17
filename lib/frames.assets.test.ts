import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_FRAME_ID, FRAMES } from "@/lib/frames";

/**
 * Frame asset invariants (UI_UX §4.2, owner decision 2026-08-17): every
 * frame asset must be a PNG with signature, 1080×1920 (9:16) IHDR, and a
 * true alpha channel (colorType 6). The photo-area transparency itself is a
 * design-time concern verified by the asset checklist; this guards the
 * structural invariants that compositing depends on.
 */

function readIHDR(filePath: string) {
  const bytes = readFileSync(filePath);
  const signature = Buffer.from(bytes.subarray(0, 8)).toString("hex");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  return { signature, width, height, bitDepth, colorType };
}

describe("frame assets — structural 9:16 invariants", () => {
  for (const frame of FRAMES) {
    if (frame.id === DEFAULT_FRAME_ID) continue;
    it(`${frame.id}: valid PNG, 1080×1920, true alpha (colorType 6)`, () => {
      const path = join(process.cwd(), "public", frame.src);
      const ihdr = readIHDR(path);
      expect(ihdr.signature).toBe("89504e470d0a1a0a");
      expect(ihdr.width).toBe(1080);
      expect(ihdr.height).toBe(1920);
      expect(ihdr.bitDepth).toBe(8);
      expect(ihdr.colorType).toBe(6);
    });
  }
});
