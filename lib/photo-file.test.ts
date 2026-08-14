import { describe, expect, it } from "vitest";

import { loadPhotoFileConfig } from "@/lib/photo-file";

describe("loadPhotoFileConfig", () => {
  it("defaults to the Vercel-compatible 4 MB cap (owner decision 2026-08-15)", () => {
    expect(loadPhotoFileConfig({}).maxSizeBytes).toBe(4_000_000);
  });

  it("falls back to the default when the env value is not a positive number", () => {
    expect(loadPhotoFileConfig({ PHOTO_MAX_SIZE_BYTES: "abc" }).maxSizeBytes).toBe(4_000_000);
    expect(loadPhotoFileConfig({ PHOTO_MAX_SIZE_BYTES: "-5" }).maxSizeBytes).toBe(4_000_000);
  });
});
