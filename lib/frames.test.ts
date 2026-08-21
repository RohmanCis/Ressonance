import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_ID, FRAMES, FRAME_OUTPUT, FRAME_ASPECT_RATIO } from "@/lib/frames";

const REAL_FRAMES = FRAMES.filter((f) => f.id !== DEFAULT_FRAME_ID);
const EXPECTED_IDS = ["royal-gold", "botanical-romance", "modern-editorial"];

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
  it("registers exactly the 3 luxury templates in curated order", () => {
    expect(REAL_FRAMES.map((f) => f.id)).toEqual(EXPECTED_IDS);
    expect(REAL_FRAMES.map((f) => f.label)).toEqual([
      "Royal Gold Serif",
      "Botanical Romance",
      "Modern Editorial",
    ]);
  });

  it("gives every template an event-title text layer with a valid schema", () => {
    for (const frame of REAL_FRAMES) {
      expect(frame.textLayers.length).toBeGreaterThanOrEqual(1);
      for (const layer of frame.textLayers) {
        expect(layer.text).toBe("eventTitle");
        expect(["--font-pinyon", "--font-cormorant", "--font-dm-mono"]).toContain(layer.fontVar);
        expect(["cursive", "serif", "monospace"]).toContain(layer.fallback);
        expect(layer.sizePx).toBeGreaterThan(0);
        expect(layer.yRatio).toBeGreaterThan(0);
        expect(layer.yRatio).toBeLessThan(1);
        expect(layer.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(layer.fontWeight ?? 400).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("assigns the three approved display fonts one distinct role", () => {
    const vars = REAL_FRAMES.flatMap((f) => f.textLayers.map((l) => l.fontVar));
    expect(new Set(vars).size).toBe(3);
  });
});
