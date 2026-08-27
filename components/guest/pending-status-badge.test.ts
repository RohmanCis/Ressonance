import { describe, expect, it } from "vitest";
import { statusPillDotClass, statusPillLabel } from "./pending-status-badge";

describe("statusPillDotClass", () => {
  it("maps confirmed/uploading to the active accent", () => {
    expect(statusPillDotClass("confirmed")).toBe("bg-accent");
    expect(statusPillDotClass("uploading")).toBe("bg-accent");
  });
  it("maps error/expired to the error token", () => {
    expect(statusPillDotClass("error")).toBe("bg-error");
    expect(statusPillDotClass("expired")).toBe("bg-error");
  });
  it("falls back to muted for pending", () => {
    expect(statusPillDotClass("pending")).toBe("bg-text-muted");
  });
});

describe("statusPillLabel", () => {
  it("returns the exact review pill strings (e2e locked)", () => {
    expect(statusPillLabel("pending")).toBe("Belum terkirim");
    expect(statusPillLabel("uploading")).toBe("Ngirim…");
    expect(statusPillLabel("confirmed")).toBe("Tersimpan");
    expect(statusPillLabel("error")).toBe("Belum tersimpan");
    expect(statusPillLabel("expired")).toBe("Belum tersimpan — sesi habis");
  });
});
