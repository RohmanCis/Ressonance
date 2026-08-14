import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { checkSessionCreateRateLimit } from "@/lib/session-create-rate-limit";

/**
 * DB integration test for the session-create rate limiter (migration 0003,
 * ADR-008). Applies 0003 to an isolated test database and verifies the
 * fixed-window semantics: under/at/over limit, atomicity under concurrency,
 * window reset via injected `now`, and identity isolation. The module uses the
 * shared lazy pg pool (lib/db.ts), so TEST_DATABASE_URL is forwarded as
 * DATABASE_URL before the first call. SKIPS when no Postgres is reachable.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "0003_session_create_rate_limits.sql",
);

const CONFIG = { max: 3, windowMs: 1000 };

let available = false;

beforeAll(async () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:54322/guestbook_test";
  vi.stubEnv("DATABASE_URL", connectionString);

  // getPgPool is lazy: the pool is created on the first call below, after the
  // env stub. Verify reachability by exercising the table setup.
  const { Pool } = await import("pg");
  const probe = new Pool({ connectionString });
  try {
    await probe.query("SELECT 1");
  } catch {
    available = false;
    return;
  }
  await probe.query("DROP TABLE IF EXISTS session_create_rate_limits;");
  await probe.query(readFileSync(MIGRATION_PATH, "utf8"));
  await probe.end();
  available = true;
});

describe("session-create rate limit (migration 0003)", () => {
  it("database is reachable", (ctx) => {
    if (!available) ctx.skip();
    expect(available).toBe(true);
  });

  it("allows requests under the limit", async () => {
    if (!available) return;
    const r1 = await checkSessionCreateRateLimit("it-under", CONFIG, 1000);
    const r2 = await checkSessionCreateRateLimit("it-under", CONFIG, 1000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("allows the request at the limit (hit == max)", async () => {
    if (!available) return;
    const r3 = await checkSessionCreateRateLimit("it-under", CONFIG, 1000);
    expect(r3.allowed).toBe(true);
  });

  it("rejects the request over the limit with retryAfterSeconds >= 1", async () => {
    if (!available) return;
    const r4 = await checkSessionCreateRateLimit("it-under", CONFIG, 1000);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("stays atomic under concurrent requests (exactly max allowed)", async () => {
    if (!available) return;
    const results = await Promise.all(
      Array.from({ length: CONFIG.max + 2 }, () =>
        checkSessionCreateRateLimit("it-concurrent", CONFIG, 5000),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(CONFIG.max);
    expect(results.filter((r) => !r.allowed)).toHaveLength(2);
  });

  it("resets the counter once the aligned window has elapsed", async () => {
    if (!available) return;
    const key = "it-window";
    // Use real-clock-based injected `now` (epoch-aligned) so the window_start
    // rows stay inside the cleanup sweep horizon (now() - 1 hour).
    const w1 = Date.now() - (Date.now() % CONFIG.windowMs);
    await checkSessionCreateRateLimit(key, CONFIG, w1);
    await checkSessionCreateRateLimit(key, CONFIG, w1);
    await checkSessionCreateRateLimit(key, CONFIG, w1);
    const r4 = await checkSessionCreateRateLimit(key, CONFIG, w1);
    expect(r4.allowed).toBe(false);

    // Advance injected `now` past the window end: a new aligned window starts.
    const r5 = await checkSessionCreateRateLimit(key, CONFIG, w1 + 2 * CONFIG.windowMs);
    expect(r5.allowed).toBe(true);

    // Two distinct window_start rows exist for the key.
    const { Pool } = await import("pg");
    const probe = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:54322/guestbook_test",
    });
    const { rows } = await probe.query(
      `SELECT window_start, hit_count FROM session_create_rate_limits
        WHERE identity_key = $1 ORDER BY window_start`,
      [key],
    );
    await probe.end();
    expect(rows).toHaveLength(2);
    expect(rows[0].hit_count).toBe(4);
    expect(rows[1].hit_count).toBe(1);
  });

  it("keeps distinct identity keys independent", async () => {
    if (!available) return;
    for (let i = 0; i < CONFIG.max + 1; i++) {
      await checkSessionCreateRateLimit("it-identity-a", CONFIG, 20_000);
    }
    const over = await checkSessionCreateRateLimit("it-identity-a", CONFIG, 20_000);
    expect(over.allowed).toBe(false);
    const other = await checkSessionCreateRateLimit("it-identity-b", CONFIG, 20_000);
    expect(other.allowed).toBe(true);
  });
});
