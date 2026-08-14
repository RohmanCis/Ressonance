import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { generateSessionToken, hashSessionToken } from "@/lib/guest-session";
import type { PhotoStorage } from "@/lib/photo-storage";
import { createPhotoTxRepo } from "@/lib/photo-tx-repo";
import {
  PHOTO_LIMIT,
  resolvePhotoAuth,
  submitPhoto,
  type PhotoSession,
} from "@/lib/submit-photo";

/**
 * Concurrency integration test (TECHNICAL_DESIGN §8 / task.md).
 *
 * Runs 6 concurrent photo submissions for one GuestSession against a real
 * Postgres and asserts at most 5 rows and at most 5 accepted responses. Storage
 * is faked (in-memory) — the DB row lock is what serializes submissions. SKIPS
 * when no Postgres is reachable (TEST_DATABASE_URL or local default).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "0001_initial_schema.sql",
);

let pool: Pool | null = null;
let available = false;
let eventId = "";
let sessionId = "";
let rawToken = "";
let publicId = "";

function jpegBytes(): Uint8Array {
  const b = new Uint8Array(20);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

beforeAll(async () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:54322/guestbook_test";
  const p = new Pool({ connectionString });
  try {
    await p.query("SELECT 1");
  } catch {
    available = false;
    return;
  }
  available = true;
  pool = p;

  await p.query("DROP TABLE IF EXISTS voice_notes, photos, guest_sessions, events, admins CASCADE;");
  await p.query(readFileSync(MIGRATION_PATH, "utf8"));

  const admin = await p.query("INSERT INTO admins (email) VALUES ($1) RETURNING id", [
    "photo-concurrency-" + Date.now() + "@example.com",
  ]);
  const evtPid = "evt-conc-" + Date.now();
  const event = await p.query(
    "INSERT INTO events (public_id, admin_id, title) VALUES ($1, $2, 'Concurrency') RETURNING id",
    [evtPid, admin.rows[0].id],
  );
  eventId = event.rows[0].id;
  publicId = evtPid;

  rawToken = generateSessionToken();
  const session = await p.query(
    "INSERT INTO guest_sessions (event_id, session_token, public_ref, guest_name) VALUES ($1, $2, $3, $4) RETURNING id",
    [eventId, hashSessionToken(rawToken), "ref-photo-conc-" + Date.now(), "Racer"],
  );
  sessionId = session.rows[0].id;
});

describe("concurrent photo submissions (TECHNICAL_DESIGN §8)", () => {
  it("database is reachable", (ctx) => {
    if (!available) ctx.skip();
    expect(available).toBe(true);
  });

  it("accepts at most 5 of 6 concurrent submissions and never exceeds the limit", async () => {
    if (!pool || !available) return;

    const db = pool;
    const sharedStorage = new Set<string>();
    const storage: PhotoStorage = {
      async upload(key) {
        sharedStorage.add(key);
      },
      async delete(key) {
        sharedStorage.delete(key);
      },
    };

    const sessionRepo: PhotoSession = {
      async findEventByPublicId(pid) {
        const { rows } = await db.query("SELECT id, status FROM events WHERE public_id = $1", [pid]);
        return rows[0] ?? null;
      },
      async findSessionByTokenHash(hash) {
        const { rows } = await db.query(
          "SELECT id, event_id, session_token, guest_name, expires_at FROM guest_sessions WHERE session_token = $1",
          [hash],
        );
        return rows[0] ?? null;
      },
    };

    const auth = await resolvePhotoAuth(sessionRepo, {
      publicId,
      cookieValue: rawToken,
    });
    expect(auth.kind).toBe("ok");
    if (auth.kind !== "ok") return;
    const { event, session } = auth;

    const results = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const client = await db.connect();
        try {
          return await submitPhoto(
            {
              sessionRepo,
              txRepo: createPhotoTxRepo(client),
              storage,
              config: { maxSizeBytes: 1000 },
            },
            { event, session, data: jpegBytes() },
          );
        } finally {
          client.release();
        }
      }),
    );

    const accepted = results.filter((r) => r.kind === "ok");
    const rejected = results.filter((r) => r.kind === "photo_limit_reached");

    expect(accepted).toHaveLength(PHOTO_LIMIT);
    expect(rejected).toHaveLength(1);
    expect(accepted.length + rejected.length).toBe(6);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM photos WHERE guest_session_id = $1", [
      sessionId,
    ]);
    expect(rows[0].count).toBe(PHOTO_LIMIT);
    // The rejected request never wrote an object.
    expect(sharedStorage.size).toBe(PHOTO_LIMIT);
  });
});