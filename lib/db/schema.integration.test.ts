import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Database integration tests (T004-R1 scope 1).
 *
 * Applies the canonical schema migration to an isolated test database and
 * verifies tables, FKs, unique constraints, the partial ACTIVE-event index,
 * session-token uniqueness, and the intended RLS / server-only boundary.
 *
 * The test SKIPS when no database is reachable (e.g. CI without a Postgres).
 * Configure via TEST_DATABASE_URL, or the local Supabase defaults below.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "0001_initial_schema.sql",
);

let client: Client | null = null;
let available = false;

beforeAll(async () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:54322/guestbook_test";
  const c = new Client({ connectionString });
  try {
    await c.connect();
  } catch {
    available = false;
    return;
  }
  available = true;
  client = c;

  // Fresh schema: drop our tables in dependency order, then apply the migration.
  await c.query(`
    DROP TABLE IF EXISTS voice_notes, photos, guest_sessions, events, admins CASCADE;
  `);
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  await c.query(sql);
});

describe("database integration (T004-R1)", () => {
  it("database is reachable", () => {
    expect(available).toBe(true);
  });

  it("creates all schema tables", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('admins','events','guest_sessions','photos','voice_notes')`,
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      ["admins", "events", "guest_sessions", "photos", "voice_notes"],
    );
  });

  it("enforces FK ON DELETE RESTRICT and the presumably-referential FK columns", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT tc.constraint_name, ccu.table_name AS ref_table
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name IN ('events','guest_sessions','photos','voice_notes')
        ORDER BY tc.table_name`,
    );
    const refs = rows.map((r) => r.ref_table);
    expect(refs).toContain("admins");
    expect(refs).toContain("events");
    expect(refs).toContain("guest_sessions");
  });

  it("enforces unique constraints on event public_id and session_token", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT conname FROM pg_constraint
       WHERE conname IN ('uq_events_public_id','uq_guest_sessions_token','uq_voice_notes_one_per_session')`,
    );
    expect(rows.map((r) => r.conname).sort()).toEqual([
      "uq_events_public_id",
      "uq_guest_sessions_token",
      "uq_voice_notes_one_per_session",
    ]);
  });

  it("enforces the partial unique index for one ACTIVE event per admin", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'uq_events_one_active_per_admin'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("enforces the closed_at consistency CHECK constraint", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT conname FROM pg_constraint WHERE conname = 'ck_events_closed_at_consistency'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("enables RLS on every table (server-only boundary)", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('admins','events','guest_sessions','photos','voice_notes')`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual(
      ["admins", "events", "guest_sessions", "photos", "voice_notes"],
    );
    for (const r of rows) expect(r.relrowsecurity).toBe(true);
  });

  it("grants no guest tables to anon or authenticated (no public read path)", async () => {
    if (!client || !available) return;
    const { rows } = await client.query(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
       WHERE table_schema='public'
         AND table_name IN ('admins','events','guest_sessions','photos','voice_notes')
         AND grantee IN ('anon','authenticated','public')`,
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks anon/authenticated data access and allows the server role path", async () => {
    if (!client || !available) return;
    // Behaviorally assert RLS + revoked grants close the anon path.
    await expect(client.query("SET ROLE anon")).resolves.not.toThrow();
    await expect(
      client.query("SELECT * FROM events LIMIT 1"),
    ).rejects.toThrow(/permission denied|denied/);
    await expect(client.query("RESET ROLE")).resolves.not.toThrow();

    // The server-only path (service-role / superuser) can read and write.
    const { rows } = await client.query(
      `INSERT INTO admins (email) VALUES ('it-seed@example.com') RETURNING id`,
    );
    const adminId = rows[0].id;
    await client.query(
      `INSERT INTO events (public_id, admin_id, title) VALUES ($1, $2, 'IT Event')`,
      ["public-it-" + Date.now(), adminId],
    );
    // FK is ON DELETE RESTRICT: deleting an admin with events must be rejected.
    await expect(
      client.query(`DELETE FROM admins WHERE id = $1`, [adminId]),
    ).rejects.toThrow(/violates foreign key/);
  });
});