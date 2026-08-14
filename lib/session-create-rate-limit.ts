import { getPgPool } from "@/lib/db";
import type { RateLimitConfig } from "@/lib/rate-limit";

/**
 * DB-backed fixed-window rate limit for GuestSession creation (ADR-008).
 *
 * The counter lives in `session_create_rate_limits` (migration 0003), keyed by
 * `(identity_key, window_start)` with windows aligned to the epoch, so the
 * limit is authoritative across application instances. A single atomic
 * statement (INSERT ... ON CONFLICT DO UPDATE SET hit_count = hit_count + 1)
 * bumps the counter and sweeps stale windows older than one hour.
 *
 * Fail-closed: on a DB error this throws and the caller maps it to an internal
 * error. `now` is injectable for deterministic tests.
 */

export interface SessionCreateRateLimitDecision {
  allowed: boolean;
  /** Seconds until the aligned window resets; >= 1 when not allowed. */
  retryAfterSeconds: number;
}

export async function checkSessionCreateRateLimit(
  identityKey: string,
  config: RateLimitConfig,
  now: number = Date.now(),
): Promise<SessionCreateRateLimitDecision> {
  const windowStartMs = Math.floor(now / config.windowMs) * config.windowMs;
  const pool = getPgPool();
  const { rows } = await pool.query(
    `WITH cleanup AS (
       DELETE FROM session_create_rate_limits
       WHERE window_start < now() - interval '1 hour'
     ), bumped AS (
       INSERT INTO session_create_rate_limits (identity_key, window_start, hit_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (identity_key, window_start)
       DO UPDATE SET hit_count = session_create_rate_limits.hit_count + 1
       RETURNING hit_count
     )
     SELECT hit_count FROM bumped;`,
    [identityKey, new Date(windowStartMs).toISOString()],
  );

  const hitCount = rows[0].hit_count as number;
  return {
    allowed: hitCount <= config.max,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStartMs + config.windowMs - now) / 1000),
    ),
  };
}
