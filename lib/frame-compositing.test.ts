import { describe, expect, it } from "vitest";
import { computeCoverCrop } from "@/lib/frame-compositing";
import { FRAME_ASPECT_RATIO, FRAME_OUTPUT } from "@/lib/frames";

describe("computeCoverCrop — deterministic center cover-crop to 1080×1920", () => {
  it("is the identity for an already 9:16 source", () => {
    expect(computeCoverCrop(1080, 1920)).toEqual({
      sx: 0, sy: 0, sw: 1080, sh: 1920,
      dx: 0, dy: 0, dw: 1080, dh: 1920,
    });
  });

  it("crops the sides of a 16:9 landscape sensor (centered)", () => {
    // scale = max(1080/1920, 1920/1080) = 16/9 → sw = 607.5, sh = 1080
    const crop = computeCoverCrop(1920, 1080)!;
    expect(crop.sw).toBeCloseTo(607.5, 6);
    expect(crop.sh).toBe(1080);
    expect(crop.sx).toBeCloseTo(656.25, 6);
    expect(crop.sy).toBe(0);
  });

  it("crops top/bottom of a sensor taller than 9:16 (centered)", () => {
    // scale = max(1, 0.8) = 1 → sw = 1080, sh = 1920, vertical overflow 480
    const crop = computeCoverCrop(1080, 2400)!;
    expect(crop.sw).toBe(1080);
    expect(crop.sh).toBe(1920);
    expect(crop.sx).toBe(0);
    expect(crop.sy).toBe(240);
  });

  it("crops a square sensor symmetrically on the horizontal axis", () => {
    const crop = computeCoverCrop(1080, 1080)!;
    expect(crop.sh).toBe(1080);
    expect(crop.sw).toBeCloseTo(607.5, 6);
    expect(crop.sx).toBeCloseTo(236.25, 6);
    expect(crop.sy).toBe(0);
  });

  it("maps every sensor ratio to the fixed output box without distortion", () => {
    const sensors: Array<[number, number]> = [
      [640, 480], [1280, 720], [1920, 1080], [1080, 1080],
      [720, 1280], [1080, 1920], [1080, 2340], [4032, 3024], [3840, 2160],
    ];
    for (const [w, h] of sensors) {
      const crop = computeCoverCrop(w, h)!;
      expect(crop.dw).toBe(FRAME_OUTPUT.width);
      expect(crop.dh).toBe(FRAME_OUTPUT.height);
      // Source crop keeps the 9:16 ratio (no stretch)…
      expect(crop.sw / crop.sh).toBeCloseTo(FRAME_ASPECT_RATIO, 6);
      // …covers the source (crop never exceeds source bounds)…
      expect(crop.sx).toBeGreaterThanOrEqual(0);
      expect(crop.sy).toBeGreaterThanOrEqual(0);
      expect(crop.sx + crop.sw).toBeLessThanOrEqual(w + 1e-6);
      expect(crop.sy + crop.sh).toBeLessThanOrEqual(h + 1e-6);
      // …and is centered.
      expect(crop.sx - (w - crop.sw - crop.sx)).toBeCloseTo(0, 6);
      expect(crop.sy - (h - crop.sh - crop.sy)).toBeCloseTo(0, 6);
    }
  });

  it("returns null for degenerate sources (video not ready)", () => {
    expect(computeCoverCrop(0, 0)).toBeNull();
    expect(computeCoverCrop(0, 1920)).toBeNull();
    expect(computeCoverCrop(1080, -5)).toBeNull();
    expect(computeCoverCrop(Number.NaN, 1920)).toBeNull();
    expect(computeCoverCrop(Number.POSITIVE_INFINITY, 1920)).toBeNull();
  });
});
