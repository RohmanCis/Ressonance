import "server-only";

import type { Client } from "pg";

import type { VoiceNoteMimeType } from "@/lib/audio-file";

/**
 * Transaction-scoped voice-note persistence against direct Postgres (T007).
 *
 * Unlike photos (T006), voice notes take NO per-session row lock:
 * `UNIQUE(guest_session_id)` on voice_notes is the final race-safe guard
 * (ADR-005 / TECHNICAL_DESIGN §9). One `pg` client owns the whole acceptance
 * flow: BEGIN → event-row lock (revalidate ACTIVE atomically) → (upload
 * happens outside this module) → metadata insert → COMMIT. Storage is not
 * part of the DB transaction; the orchestrator coordinates upload and
 * compensation.
 *
 * If any step inside `begin` fails, the transaction is rolled back before the
 * error propagates so the pool client is never returned in a dirty state.
 */

/** Thrown by `insertVoiceNote` when the one-per-session unique guard fires. */
export class VoiceNoteUniqueViolationError extends Error {
  constructor(readonly constraint: string) {
    super(`voice-note unique violation: ${constraint}`);
    this.name = "VoiceNoteUniqueViolationError";
  }
}

export interface VoiceNoteTx {
  /** Event status re-read inside the transaction (guards concurrent close). */
  eventStatus: string;
  insertVoiceNote(input: {
    sessionId: string;
    storageKey: string;
    fileSize: number;
    mimeType: VoiceNoteMimeType;
    durationSeconds: number;
  }): Promise<{ id: string; created_at: string }>;
  countPhotos(sessionId: string): Promise<number>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface VoiceNoteTxRepo {
  begin(sessionId: string, eventId: string): Promise<VoiceNoteTx>;
}

/**
 * Build a transaction repo bound to a single `pg` client. The caller must
 * check the client back out (release) when done. rollback() is idempotent and
 * safe both before and after COMMIT.
 */
export function createVoiceNoteTxRepo(client: Client): VoiceNoteTxRepo {
  return {
    async begin(sessionId, eventId) {
      try {
        await client.query("BEGIN");
        // Lock the event row and read its status atomically, coordinated with
        // the GuestSession lock photos take. Holding this lock until COMMIT
        // prevents a concurrent close from being accepted mid-submission
        // (QA-2 #3). NO per-session voice-note lock: the UNIQUE constraint
        // serializes concurrent voice submissions (TD §9).
        const { rows: eventRows } = await client.query<{ status: string }>(
          "SELECT status FROM events WHERE id = $1 FOR UPDATE",
          [eventId],
        );
        const eventStatus = eventRows[0]?.status ?? "";

        return {
          eventStatus,
          async insertVoiceNote(input) {
            try {
              const { rows: inserted } = await client.query<{
                id: string;
                created_at: string;
              }>(
                "INSERT INTO voice_notes (guest_session_id, storage_key, file_size, mime_type, duration_seconds) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at",
                [
                  input.sessionId,
                  input.storageKey,
                  input.fileSize,
                  input.mimeType,
                  input.durationSeconds,
                ],
              );
              const row = inserted[0];
              return { id: row.id, created_at: row.created_at };
            } catch (err) {
              const e = err as { code?: string; constraint?: string };
              if (
                e?.code === "23505" &&
                e?.constraint === "uq_voice_notes_one_per_session"
              ) {
                throw new VoiceNoteUniqueViolationError(e.constraint);
              }
              throw err;
            }
          },
          async countPhotos(sid) {
            const { rows: pr } = await client.query<{ count: number }>(
              "SELECT COUNT(*)::int AS count FROM photos WHERE guest_session_id = $1",
              [sid],
            );
            return pr[0].count;
          },
          async commit() {
            await client.query("COMMIT");
          },
          async rollback() {
            await client.query("ROLLBACK").catch(() => undefined);
          },
        };
      } catch (err) {
        // Best-effort rollback if a transaction was opened before the failure.
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      }
    },
  };
}