import { describe, expect, it } from "vitest";
import { formatTime } from "./audio-player";

describe("formatTime", () => {
  it("formats m:ss with zero-padded seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(59)).toBe("0:59");
    expect(formatTime(60)).toBe("1:00");
    expect(formatTime(125.7)).toBe("2:05");
    expect(formatTime(600)).toBe("10:00");
  });
  it("clamps negative input to zero", () => {
    expect(formatTime(-3)).toBe("0:00");
  });
});
