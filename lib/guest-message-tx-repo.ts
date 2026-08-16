import "server-only";

import type { Client } from "pg";

/**
 * Transaction-scoped guest-message persistence against direct Postgres
 * (guest message feature, Opsi B).
 *
 * Mirrors `voice-note-tx-repo.ts`: one `pg` client owns the whole acceptance
 * flow — BEGIN → event-row lock (revalidate ACTIVE atomically) → insert →
 * usage counts → COMMIT. There is NO per-session row lock because
 * `UNIQUE(guest_session_id)` on guest_messages is the final race-safe guard,
 * exactly as for voice notes (TECHNICAL_DESIGN §9). There is no object
 * storage and therefore no compensation step: the transaction is purely
 * relational.
 *
 * If any step inside `begin` fails, the transaction is rolled back before the
 * error propagates so the pool client is never returned in a dirty state.
 */

/** Thrown by `insertGuestMessage` when the one-per-session unique guard fires. */
export class GuestMessageUniqueViolationError extends Error {
  constructor(readonly constraint: string) {
    super(`guest-message unique violation: ${constraint}`);
    this.name = "GuestMessageUniqueViolationError";
  }
}

export interface GuestMessageTx {
  /** Event status re-read inside the transaction (guards concurrent close). */
  eventStatus: string;
  /**
   * UX-only pre-check: whether a message already exists for the session.
   * NOT authoritative under concurrency — the unique constraint is (TD §9).
   */
  existingGuestMessage: boolean;
  insertGuestMessage(input: {
    sessionId: string;
    messageText: string;
  }): Promise<{ id: string; created_at: string }>;
  countPhotos(sessionId: string): Promise<number>;
  voiceNoteExists(sessionId: string): Promise<boolean>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface GuestMessageTxRepo {
  begin(sessionId: string, eventId: string): Promise<GuestMessageTx>;
}

/**
 * Build a transaction repo bound to a single `pg` client. The caller must
 * check the client back out (release) when done. rollback() is idempotent and
 * safe both before and after COMMIT.
 */
export function createGuestMessageTxRepo(client: Client): GuestMessageTxRepo {
  return {
    async begin(sessionId, eventId) {
      try {
        await client.query("BEGIN");
        // Lock the event row and read its status atomically, coordinated with
        // the GuestSession lock photos take. Holding this lock until COMMIT
        // prevents a concurrent close from being accepted mid-submission.
        // NO per-session message lock: the UNIQUE constraint serializes
        // concurrent message submissions (TD §9 pattern).
        const { rows: eventRows } = await client.query<{ status: string }>(
          "SELECT status FROM events WHERE id = $1 FOR UPDATE",
          [eventId],
        );
        const eventStatus = eventRows[0]?.status ?? "";

        // Optional UX pre-check; the unique constraint remains authoritative.
        const { rows: pre } = await client.query<{ exists: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM guest_messages WHERE guest_session_id = $1) AS exists",
          [sessionId],
        );
        const existingGuestMessage = pre[0]?.exists ?? false;

        return {
          eventStatus,
          existingGuestMessage,
          async insertGuestMessage(input) {
            try {
              const { rows: inserted } = await client.query<{
                id: string;
                created_at: string;
              }>(
                "INSERT INTO guest_messages (guest_session_id, message_text) VALUES ($1, $2) RETURNING id, created_at",
                [input.sessionId, input.messageText],
              );
              const row = inserted[0];
              return { id: row.id, created_at: row.created_at };
            } catch (err) {
              const e = err as { code?: string; constraint?: string };
              if (
                e?.code === "23505" &&
                e?.constraint === "uq_guest_messages_one_per_session"
              ) {
                throw new GuestMessageUniqueViolationError(e.constraint);
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
          async voiceNoteExists(sid) {
            const { rows: vr } = await client.query<{ exists: boolean }>(
              "SELECT EXISTS(SELECT 1 FROM voice_notes WHERE guest_session_id = $1) AS exists",
              [sid],
            );
            return vr[0]?.exists ?? false;
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
