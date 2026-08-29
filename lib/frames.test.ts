import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_ID, FRAMES, FRAME_OUTPUT, FRAME_ASPECT_RATIO } from "@/lib/frames";

const REAL_FRAMES = FRAMES.filter((f) => f.id !== DEFAULT_FRAME_ID);
const EXPECTED_IDS = ["royal-gold", "botanical-romance", "modern-editorial", "wedding-crimson", "flower"];

describe("frame registry invariants", () => {
  it("enforces a single 9:16 standard", () => {
    expect(FRAME_ASPECT_RATIO).toBe(9 / 16);
    expect(FRAME_OUTPUT).toEqual({ width: 1080, height: 1920 });
    expect(FRAME_OUTPUT.width / FRAME_OUTPUT.height).toBeCloseTo(FRAME_ASPECT_RATIO, 10);
  });

  it("exposes no per-frame aspect metadata (single invariant, not per-frame)", () => {
    for (const frame of FRAMES) {
      expect(Object.keys(frame).sort()).toEqual(["id", "label", "src", "textLayers"]);
    }
  });

  it("has unique ids and exactly one 'none' default with empty src and no text layers", () => {
    const ids = FRAMES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const none = FRAMES.find((f) => f.id === DEFAULT_FRAME_ID);
    expect(none).toBeDefined();
    expect(none!.src).toBe("");
    expect(none!.label).toBe("No Frame");
    expect(none!.textLayers).toEqual([]);
  });

  it("maps every real frame to a /frames/<id>.png asset path", () => {
    for (const frame of REAL_FRAMES) {
      expect(frame.src).toBe(`/frames/${frame.id}.png`);
    }
  });
});

describe("curated wedding template registry (Dynamic Frame Engine)", () => {
  it("registers exactly the 5 templates in curated order", () => {
    expect(REAL_FRAMES.map((f) => f.id)).toEqual(EXPECTED_IDS);
    expect(REAL_FRAMES.map((f) => f.label)).toEqual([
      "Royal Gold Serif",
      "Botanical Romance",
      "Modern Editorial",
      "Wedding Crimson",
      "Flower",
    ]);
  });

  it("registers no text layers on any frame (owner decision 2026-08-29: no event-title stamp on captured photos)", () => {
    for (const frame of REAL_FRAMES) {
      expect(frame.textLayers).toEqual([]);
    }
  });
});
