import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_ID, FRAMES, FRAME_OUTPUT, FRAME_ASPECT_RATIO } from "@/lib/frames";

const REAL_FRAMES = FRAMES.filter((f) => f.id !== DEFAULT_FRAME_ID);
const EXPECTED_IDS = ["wedding-crimson", "flower", "new", "clean"];

describe("frame registry invariants", () => {
  it("enforces a single 9:16 standard", () => {
    expect(FRAME_ASPECT_RATIO).toBe(9 / 16);
    expect(FRAME_OUTPUT).toEqual({ width: 1080, height: 1920 });
    expect(FRAME_OUTPUT.width / FRAME_OUTPUT.height).toBeCloseTo(FRAME_ASPECT_RATIO, 10);
  });

  it("has unique ids and exactly one 'none' default with empty src", () => {
    const ids = FRAMES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const none = FRAMES.find((f) => f.id === DEFAULT_FRAME_ID);
    expect(none).toBeDefined();
    expect(none!.src).toBe("");
    expect(none!.label).toBe("No Frame");
  });

  it("maps every real frame to a /frames/<id>.png asset path", () => {
    for (const frame of REAL_FRAMES) {
      expect(frame.src).toBe(`/frames/${frame.id}.png`);
    }
  });
});

describe("curated frame registry", () => {
  it("registers exactly the current templates in order", () => {
    expect(REAL_FRAMES.map((f) => f.id)).toEqual(EXPECTED_IDS);
    expect(REAL_FRAMES.map((f) => f.label)).toEqual([
      "Wedding Crimson",
      "Flower",
      "New",
      "Clean",
    ]);
  });
});
