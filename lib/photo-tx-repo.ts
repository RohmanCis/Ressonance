import "server-only";

import type { Client } from "pg";

import type { PhotoMimeType } from "@/lib/photo-file";

/**
 * Transaction-scoped photo persistence against direct Postgres (T006).
 *
 * One `pg` client owns the whole acceptance flow: BEGIN → GuestSession row
 * lock → event-row lock (revalidate ACTIVE atomically) → count → (upload
 * happens outside this module, in the orchestrator) → metadata insert →
 * COMMIT. Storage is not part of the DB transaction; the orchestrator
 * coordinates upload and compensation.
 *
 * If any step inside `begin` fails, the transaction is rolled back before the
 * error propagates so the pool client is never returned in a dirty state.
 */

export interface PhotoTx {
  /** Event status re-read inside the transaction (guards concurrent close). */
  eventStatus: string;
  /** Authoritative current photo count for the session (after lock). */
  count: number;
  insertPhoto(input: {
    sessionId: string;
    storageKey: string;
    fileSize: number;
    mimeType: PhotoMimeType;
  }): Promise<{ id: string; created_at: string }>;
  countVoiceNotes(sessionId: string): Promise<number>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface PhotoTxRepo {
  begin(sessionId: string, eventId: string): Promise<PhotoTx>;
}

/**
 * Build a transaction repo bound to a single `pg` client. The caller must
 * check the client back out (release) when done. rollback() is idempotent and
 * safe both before and after COMMIT.
 */
export function createPhotoTxRepo(client: Client): PhotoTxRepo {
  return {
    async begin(sessionId, eventId) {
      try {
        await client.query("BEGIN");
        // Serialize concurrent submissions for the same GuestSession.
        await client.query(
          "SELECT id FROM guest_sessions WHERE id = $1 FOR UPDATE",
          [sessionId],
        );
        // Lock the event row and read its status atomically, coordinated with
        // the GuestSession lock above. Holding this lock until COMMIT prevents
        // a concurrent close from being accepted mid-submission (QA-2 #3).
        const { rows: eventRows } = await client.query<{ status: string }>(
          "SELECT status FROM events WHERE id = $1 FOR UPDATE",
          [eventId],
        );
        const eventStatus = eventRows[0]?.status ?? "";
        const { rows } = await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM photos WHERE guest_session_id = $1",
          [sessionId],
        );
        const count = rows[0].count;
        return {
          eventStatus,
          count,
          async insertPhoto(input) {
            const { rows: inserted } = await client.query<{
              id: string;
              created_at: string;
            }>(
              "INSERT INTO photos (guest_session_id, storage_key, file_size, mime_type) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
              [input.sessionId, input.storageKey, input.fileSize, input.mimeType],
            );
            const row = inserted[0];
            return { id: row.id, created_at: row.created_at };
          },
          async countVoiceNotes(sid) {
            const { rows: vr } = await client.query<{ count: number }>(
              "SELECT COUNT(*)::int AS count FROM voice_notes WHERE guest_session_id = $1",
              [sid],
            );
            return vr[0].count;
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