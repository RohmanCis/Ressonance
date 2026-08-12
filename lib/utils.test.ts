import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional class names", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});