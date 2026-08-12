import { describe, expect, it } from "vitest";

import {
  FixedWindowRateLimiter,
  loadRateLimitConfig,
  rateLimitIdentity,
} from "@/lib/rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the quota within a window", () => {
    const now = 1000;
    const limiter = new FixedWindowRateLimiter({ max: 3, windowMs: 60_000 }, () => now);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    const denied = limiter.check("k");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowRateLimiter({ max: 1, windowMs: 60_000 }, () => 0);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("resets the counter after the window elapses", () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter({ max: 1, windowMs: 1000 }, () => now);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
    now = 1001;
    expect(limiter.check("k").allowed).toBe(true);
  });
});

describe("loadRateLimitConfig", () => {
  it("applies defaults when env is absent", () => {
    const cfg = loadRateLimitConfig({});
    expect(cfg.max).toBe(10);
    expect(cfg.windowMs).toBe(60_000);
  });

  it("reads max and window from env", () => {
    const cfg = loadRateLimitConfig({
      SESSION_RATE_LIMIT_MAX: "25",
      SESSION_RATE_LIMIT_WINDOW_SECONDS: "120",
    });
    expect(cfg.max).toBe(25);
    expect(cfg.windowMs).toBe(120_000);
  });

  it("falls back to defaults on invalid env values", () => {
    const cfg = loadRateLimitConfig({
      SESSION_RATE_LIMIT_MAX: "abc",
      SESSION_RATE_LIMIT_WINDOW_SECONDS: "-5",
    });
    expect(cfg.max).toBe(10);
    expect(cfg.windowMs).toBe(60_000);
  });
});

describe("rateLimitIdentity", () => {
  const header = (v: string | null) => () => v;

  it("does not trust forwarded headers without a trusted proxy (single bucket)", () => {
    expect(rateLimitIdentity(header("203.0.113.9"), false)).toBe("global");
    expect(rateLimitIdentity(header("1.2.3.4"), false)).toBe("global");
  });

  it("uses the first forwarded entry when a trusted proxy is configured", () => {
    expect(rateLimitIdentity(header("203.0.113.9, 10.0.0.1"), true)).toBe("203.0.113.9");
  });

  it("falls back to unknown when a trusted proxy sends no forwarded header", () => {
    expect(rateLimitIdentity(header(null), true)).toBe("unknown");
  });
});