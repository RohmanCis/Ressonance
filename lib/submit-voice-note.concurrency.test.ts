import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import type { AudioInspector } from "@/lib/audio-inspector";
import { generateSessionToken, hashSessionToken } from "@/lib/guest-session";
import { resolveGuestSubmissionAuth, type GuestSubmissionRepo } from "@/lib/guest-submission-auth";
import { submitVoiceNote } from "@/lib/submit-voice-note";
import type { VoiceNoteStorage } from "@/lib/voice-note-storage";
import { createVoiceNoteTxRepo } from "@/lib/voice-note-tx-repo";

/**
 * Concurrency integration test (TECHNICAL_DESIGN §9 / task.md).
 *
 * Runs 5 concurrent voice-note submissions for one GuestSession against a real
 * Postgres and asserts exactly 1 accepted row, 1 accepted response, 4
 * `voice_note_limit_reached`, 1 storage object kept, and 4 compensated deletes
 * (best-effort). Storage and audio inspection are faked — the UNIQUE constraint
 * is what serializes submissions. SKIPS when no Postgres is reachable.
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

function audioBytes(): Uint8Array {
  return new Uint8Array(40).fill(0x41);
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
    "voice-concurrency-" + Date.now() + "@example.com",
  ]);
  const evtPid = "evt-vconc-" + Date.now();
  const event = await p.query(
    "INSERT INTO events (public_id, admin_id, title) VALUES ($1, $2, 'Voice Concurrency') RETURNING id",
    [evtPid, admin.rows[0].id],
  );
  eventId = event.rows[0].id;
  publicId = evtPid;

  rawToken = generateSessionToken();
  const session = await p.query(
    "INSERT INTO guest_sessions (event_id, session_token, public_ref, guest_name) VALUES ($1, $2, $3, $4) RETURNING id",
    [eventId, hashSessionToken(rawToken), "ref-voice-conc-" + Date.now(), "Racer"],
  );
  sessionId = session.rows[0].id;
});

describe("concurrent voice-note submissions (TECHNICAL_DESIGN §9)", () => {
  it("database is reachable", (ctx) => {
    if (!available) ctx.skip();
    expect(available).toBe(true);
  });

  it("accepts exactly 1 of 5 concurrent submissions and compensates the losers", async () => {
    if (!pool || !available) return;

    const db = pool;
    const kept = new Set<string>();
    const written = new Set<string>();
    const storage: VoiceNoteStorage = {
      async upload(key) {
        written.add(key);
        kept.add(key);
      },
      async delete(key) {
        kept.delete(key);
      },
    };
    const inspector: AudioInspector = {
      async inspect() {
        return { status: "ok", durationSeconds: 12, formatName: "webm" };
      },
    };

    const sessionRepo: GuestSubmissionRepo = {
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

    const auth = await resolveGuestSubmissionAuth(sessionRepo, {
      publicId,
      cookieValue: rawToken,
    });
    expect(auth.kind).toBe("ok");
    if (auth.kind !== "ok") return;
    const { event, session } = auth;

    const results = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const client = await db.connect();
        try {
          return await submitVoiceNote(
            {
              txRepo: createVoiceNoteTxRepo(client),
              storage,
              inspector,
              config: { maxSizeBytes: 1000 },
            },
            { event, session, data: audioBytes() },
          );
        } finally {
          client.release();
        }
      }),
    );

    const accepted = results.filter((r) => r.kind === "ok");
    const rejected = results.filter((r) => r.kind === "voice_note_limit_reached");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(accepted.length + rejected.length).toBe(5);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM voice_notes WHERE guest_session_id = $1", [
      sessionId,
    ]);
    expect(rows[0].count).toBe(1);
    // Exactly one object survives; the four losers were compensated (best-effort).
    expect(written.size).toBe(5);
    expect(kept.size).toBe(1);
  });
});