/**
 * Minimal server-side rate limiting (ADR-008).
 *
 * Fixed-window, in-memory counter keyed by client identifier. Session creation
 * uses the authoritative DB-backed limiter in lib/session-create-rate-limit.ts;
 * photo/voice-note submission still use this in-memory limiter. Quota and
 * window are configurable via environment variables, not a product-policy
 * invention.
 *
 * ponytail: in-memory state is not shared across processes. Add a shared
 * (managed or DB-backed) store when the deployment requires multiple
 * application instances. On Vercel serverless, function instances scale
 * horizontally and are recycled dynamically — this limiter is per-instance
 * only (defense-in-depth, not cross-instance authoritative). Accepted MVP
 * limitation per ADR-008; do not rely on it for global quota enforcement.
 * (Session creation already migrated to the DB-backed limiter, migration 0003.)
 */

export interface RateLimitConfig {
  /** Maximum allowed events per window for a single key. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the window resets; present when not allowed. */
  retryAfterSeconds: number | null;
}

export interface RateLimitStore {
  check(key: string): RateLimitDecision;
}

/**
 * Fixed-window limiter. Resets the counter when the window has elapsed.
 * `now` is injectable for deterministic tests.
 */
export class FixedWindowRateLimiter implements RateLimitStore {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const t = this.now();
    const current = this.buckets.get(key);

    if (!current || t >= current.windowStart + this.config.windowMs) {
      this.buckets.set(key, { windowStart: t, count: 1 });
      return { allowed: true, retryAfterSeconds: null };
    }

    if (current.count < this.config.max) {
      current.count += 1;
      return { allowed: true, retryAfterSeconds: null };
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.windowStart + this.config.windowMs - t) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }
}

/**
 * Derive the client identity for rate limiting WITHOUT trusting arbitrary
 * client-supplied forwarded headers.
 *
 * Safe mechanism (ADR-008 "trusted proxy behavior"): forwarded headers are
 * only honored when a trusted reverse proxy is explicitly configured
 * (`TRUSTED_PROXY=1`). The deployment asserts that proxy sets/sanitizes
 * `x-forwarded-for` and strips any client-supplied value. Without that
 * config, every request falls back to a single coarse bucket ("global") —
 * safe (over-restrictive) and non-spoofable, never bypassable by setting a
 * header.
 */
export function rateLimitIdentity(
  getHeader: (name: string) => string | null,
  trustProxy: boolean,
): string {
  if (!trustProxy) return "global";
  const forwarded = getHeader("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/** Load rate-limit config from environment with conservative defaults. */
export function loadRateLimitConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): RateLimitConfig {
  const max = Number(env.SESSION_RATE_LIMIT_MAX ?? 10);
  const windowSeconds = Number(env.SESSION_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    windowMs: (Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60) * 1000,
  };
}