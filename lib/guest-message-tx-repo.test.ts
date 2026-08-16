import { describe, expect, it, vi } from "vitest";

import {
  createGuestMessageTxRepo,
  GuestMessageUniqueViolationError,
} from "@/lib/guest-message-tx-repo";

/**
 * Unit tests for the guest-message transaction repo (Opsi B).
 *
 * The repo is exercised against a scripted fake `pg` Client so the BEGIN /
 * event-lock / pre-check / insert / usage / COMMIT choreography and the
 * unique-violation mapping are verified without a live Postgres. The real
 * constraint behavior is covered by the DB integration suite.
 */

interface QueryLog {
  sql: string;
  params: unknown[];
}

function makeClient(rows: Record<string, unknown[]> = {}, fails: Record<string, unknown> = {}) {
  const log: QueryLog[] = [];
  const queries: Array<{ match: (sql: string) => boolean; result: () => unknown }> = [
    { match: (s) => s.trim() === "BEGIN", result: () => ({ rows: [] }) },
    {
      match: (s) => s.includes("SELECT status FROM events WHERE id = $1 FOR UPDATE"),
      result: () => ({ rows: rows.eventStatus ?? [{ status: "ACTIVE" }] }),
    },
    {
      match: (s) => s.includes("SELECT EXISTS(SELECT 1 FROM guest_messages"),
      result: () => ({ rows: rows.preCheck ?? [{ exists: false }] }),
    },
    {
      match: (s) => s.includes("INSERT INTO guest_messages"),
      result: () => {
        if (fails.insert) throw fails.insert;
        return { rows: [{ id: "message-1", created_at: "2026-08-17T10:00:00Z" }] };
      },
    },
    {
      match: (s) => s.includes("COUNT(*)") && s.includes("FROM photos"),
      result: () => {
        if (fails.countPhotos) throw fails.countPhotos;
        return { rows: [{ count: 2 }] };
      },
    },
    {
      match: (s) => s.includes("SELECT EXISTS(SELECT 1 FROM voice_notes"),
      result: () => {
        if (fails.voiceNoteExists) throw fails.voiceNoteExists;
        return { rows: rows.voiceNote ?? [{ exists: false }] };
      },
    },
    { match: (s) => s.trim() === "COMMIT", result: () => ({ rows: [] }) },
    {
      match: (s) => s.trim() === "ROLLBACK",
      result: () => {
        if (fails.rollback) return Promise.reject(fails.rollback);
        return { rows: [] };
      },
    },
  ];

  const client = {
    async query(sql: string, params: unknown[] = []) {
      log.push({ sql, params });
      const hit = queries.find((q) => q.match(sql));
      if (!hit) throw new Error("unmapped query: " + sql);
      return hit.result();
    },
  };
  return { client, log };
}

describe("createGuestMessageTxRepo", () => {
  it("begins, locks the event row, and reports its status", async () => {
    const { client, log } = makeClient();
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    expect(tx.eventStatus).toBe("ACTIVE");
    const beginIdx = log.findIndex((q) => q.sql.trim() === "BEGIN");
    const lockIdx = log.findIndex((q) => q.sql.includes("FOR UPDATE"));
    expect(beginIdx).toBe(0);
    expect(lockIdx).toBeGreaterThan(beginIdx);
  });

  it("reports a non-ACTIVE status observed inside the transaction", async () => {
    const { client } = makeClient({ eventStatus: [{ status: "CLOSED" }] });
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    expect(tx.eventStatus).toBe("CLOSED");
  });

  it("exposes the one-per-session pre-check as a UX-only flag", async () => {
    const { client } = makeClient({ preCheck: [{ exists: true }] });
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    expect(tx.existingGuestMessage).toBe(true);
  });

  it("inserts the trimmed text for the session and returns id/created_at", async () => {
    const { client, log } = makeClient();
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    const media = await tx.insertGuestMessage({
      sessionId: "session-1",
      messageText: "Pesan & kesan",
    });
    expect(media).toEqual({ id: "message-1", created_at: "2026-08-17T10:00:00Z" });
    const insert = log.find((q) => q.sql.includes("INSERT INTO guest_messages"));
    expect(insert?.params).toEqual(["session-1", "Pesan & kesan"]);
  });

  it("maps the unique-constraint violation to GuestMessageUniqueViolationError", async () => {
    const { client } = makeClient(
      {},
      { insert: { code: "23505", constraint: "uq_guest_messages_one_per_session" } },
    );
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    await expect(
      tx.insertGuestMessage({ sessionId: "session-1", messageText: "dup" }),
    ).rejects.toBeInstanceOf(GuestMessageUniqueViolationError);
  });

  it("rethrows non-unique insert errors untouched", async () => {
    const { client } = makeClient({}, { insert: new Error("check constraint") });
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    await expect(
      tx.insertGuestMessage({ sessionId: "session-1", messageText: "x" }),
    ).rejects.toThrow("check constraint");
  });

  it("returns photo count and voice-note existence for the usage shape", async () => {
    const { client } = makeClient({ voiceNote: [{ exists: true }] });
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    await expect(tx.countPhotos("session-1")).resolves.toBe(2);
    await expect(tx.voiceNoteExists("session-1")).resolves.toBe(true);
  });

  it("rolls back when begin fails, so the client is never left in a transaction", async () => {
    const rollbacks: string[] = [];
    const broken = {
      async query(sql: string) {
        if (sql.includes("FOR UPDATE")) throw new Error("lock timeout");
        if (sql.trim() === "ROLLBACK") {
          rollbacks.push(sql);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const repo = createGuestMessageTxRepo(broken as never);
    await expect(repo.begin("session-1", "event-1")).rejects.toThrow("lock timeout");
    expect(rollbacks).toHaveLength(1);
  });

  it("commit and rollback are safe after one another", async () => {
    const { client } = makeClient();
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    await expect(tx.rollback()).resolves.toBeUndefined();
    await expect(tx.commit()).resolves.toBeUndefined();
  });

  it("rollback swallows a failed ROLLBACK statement", async () => {
    const { client } = makeClient({}, { rollback: new Error("already aborted") });
    const repo = createGuestMessageTxRepo(client as never);
    const tx = await repo.begin("session-1", "event-1");
    await expect(tx.rollback()).resolves.toBeUndefined();
  });

  it("releases no client itself — the route owns the client lifecycle", async () => {
    const { client } = makeClient();
    const spy = vi.fn();
    (client as unknown as { release?: unknown }).release = spy;
    const repo = createGuestMessageTxRepo(client as never);
    await repo.begin("session-1", "event-1");
    expect(spy).not.toHaveBeenCalled();
  });
});
