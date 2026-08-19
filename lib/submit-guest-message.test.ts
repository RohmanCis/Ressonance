import { describe, expect, it } from "vitest";

import { generateSessionToken, hashSessionToken, type GuestSession } from "@/lib/guest-session";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  submitGuestMessage,
  validateGuestMessageText,
} from "@/lib/submit-guest-message";
import {
  type GuestMessageTxRepo,
  GuestMessageUniqueViolationError,
} from "@/lib/guest-message-tx-repo";

/**
 * Unit tests for the guest-message orchestration (Opsi B; API Contract §6.6)
 * and the auth resolution it reuses from the voice-note flow.
 */

interface State {
  events: Record<string, { id: string; status: string }>;
  sessions: Record<string, GuestSession>;
  failBegin?: boolean;
  failInsert?: boolean;
  failCommit?: boolean;
  failUsage?: boolean;
  /** Overrides the event status observed inside the transaction. */
  txEventStatus?: string;
  /** If true, existingGuestMessage pre-check returns true (UX only). */
  existingGuestMessage?: boolean;
  photoCount: number;
  hasVoiceNote: boolean;
  inserted: { sessionId: string; messageText: string }[];
  rollbacks: string[];
}

function makeTxRepo(state: State): GuestMessageTxRepo {
  return {
    async begin(sessionId, eventId) {
      if (state.failBegin) throw new Error("begin failed");
      const eventStatus = state.txEventStatus ?? state.events[eventId]?.status ?? "ACTIVE";
      return {
        eventStatus,
        existingGuestMessage: state.existingGuestMessage ?? false,
        async insertGuestMessage(input) {
          if (state.failInsert) throw new Error("insert failed");
          state.inserted.push(input);
          return { id: "message-1", created_at: "2026-08-17T10:00:00Z" };
        },
        async countPhotos() {
          if (state.failUsage) throw new Error("photo count failed");
          return state.photoCount;
        },
        async voiceNoteExists() {
          if (state.failUsage) throw new Error("voice exists failed");
          return state.hasVoiceNote;
        },
        async commit() {
          if (state.failCommit) throw new Error("commit failed");
        },
        async rollback() {
          state.rollbacks.push(sessionId);
        },
      };
    },
  };
}

function fresh(overrides: Partial<State> = {}): { state: State; rawToken: string } {
  const token = generateSessionToken();
  const session: GuestSession = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
    expires_at: "2099-01-01T00:00:00Z",
  };
  const state: State = {
    events: {
      "evt-active": { id: "event-1", status: "ACTIVE" },
      "evt-closed": { id: "event-2", status: "CLOSED" },
    },
    sessions: { [session.session_token]: session },
    photoCount: 0,
    hasVoiceNote: false,
    inserted: [],
    rollbacks: [],
    ...overrides,
  };
  return { state, rawToken: token };
}

describe("validateGuestMessageText", () => {
  it("accepts 1–280 trimmed characters and returns the trimmed text", () => {
    expect(validateGuestMessageText("  hello  ")).toEqual({ ok: true, text: "hello" });
    expect(validateGuestMessageText("x")).toEqual({ ok: true, text: "x" });
    expect(validateGuestMessageText("x".repeat(280))).toEqual({
      ok: true,
      text: "x".repeat(280),
    });
  });

  it("rejects non-strings and missing values", () => {
    expect(validateGuestMessageText(undefined)).toEqual({
      ok: false,
      field: "Message is required.",
    });
    expect(validateGuestMessageText(null)).toEqual({ ok: false, field: "Message is required." });
    expect(validateGuestMessageText(42)).toEqual({ ok: false, field: "Message is required." });
  });

  it("rejects whitespace-only input", () => {
    expect(validateGuestMessageText("   \n\t ")).toEqual({
      ok: false,
      field: "Message cannot be empty.",
    });
  });

  it("rejects more than 280 characters after trim", () => {
    expect(validateGuestMessageText("x".repeat(281))).toEqual({
      ok: false,
      field: "Message must be 280 characters or fewer.",
    });
    expect(validateGuestMessageText(`   ${"x".repeat(281)}   `)).toEqual({
      ok: false,
      field: "Message must be 280 characters or fewer.",
    });
  });

  it("exposes the same limit as the DB CHECK constraint", () => {
    expect(GUEST_MESSAGE_MAX_LENGTH).toBe(280);
  });
});

describe("submitGuestMessage", () => {
  it("returns ok with the exact submission + usage shape", async () => {
    const { state } = fresh({ photoCount: 1, hasVoiceNote: true });
    const result = await submitGuestMessage(
      { txRepo: makeTxRepo(state) },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "  Terima kasih banyak!  ",
      },
    );
    expect(result).toEqual({
      kind: "ok",
      submission: {
        id: "message-1",
        type: "GUEST_MESSAGE",
        created_at: "2026-08-17T10:00:00Z",
        message_text: "Terima kasih banyak!",
      },
      usage: {
        photos_submitted: 1,
        photos_remaining: 4,
        voice_note_submitted: true,
        voice_note_available: false,
        guest_message_submitted: true,
        guest_message_available: false,
      },
    });
    expect(state.inserted).toEqual([
      { sessionId: "session-1", messageText: "Terima kasih banyak!" },
    ]);
    expect(state.rollbacks).toHaveLength(0);
  });

  it("reports voice-note available when none exists — the flows are independent", async () => {
    const { state } = fresh({ photoCount: 0, hasVoiceNote: false });
    const result = await submitGuestMessage(
      { txRepo: makeTxRepo(state) },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "hello",
      },
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.usage.voice_note_submitted).toBe(false);
      expect(result.usage.voice_note_available).toBe(true);
      expect(result.usage.guest_message_available).toBe(false);
    }
  });

  it("returns invalid_input with a message_text field for each failure mode", async () => {
    const { state } = fresh();
    for (const bad of [undefined, null, 5, "", "   ", "x".repeat(281)]) {
      const result = await submitGuestMessage(
        { txRepo: makeTxRepo(state) },
        {
          event: state.events["evt-active"],
          session: Object.values(state.sessions)[0],
          messageText: bad,
        },
      );
      expect(result.kind).toBe("invalid_input");
      if (result.kind === "invalid_input") {
        expect(typeof result.fields.message_text).toBe("string");
        expect(result.fields.message_text.length).toBeGreaterThan(0);
      }
    }
    expect(state.inserted).toHaveLength(0);
  });

  it("returns event_closed when the event is not ACTIVE inside the transaction and rolls back", async () => {
    const { state } = fresh({ txEventStatus: "CLOSED" });
    const result = await submitGuestMessage(
      { txRepo: makeTxRepo(state) },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "hi",
      },
    );
    expect(result.kind).toBe("event_closed");
    expect(state.inserted).toHaveLength(0);
    expect(state.rollbacks).toHaveLength(1);
  });

  it("maps the unique violation to guest_message_limit_reached and rolls back", async () => {
    const { state } = fresh();
    const repo: GuestMessageTxRepo = {
      async begin() {
        return {
          eventStatus: "ACTIVE",
          existingGuestMessage: false,
          async insertGuestMessage() {
            throw new GuestMessageUniqueViolationError("uq_guest_messages_one_per_session");
          },
          async countPhotos() { return 0; },
          async voiceNoteExists() { return false; },
          async commit() {},
          async rollback() { state.rollbacks.push("session-1"); },
        };
      },
    };
    const result = await submitGuestMessage(
      { txRepo: repo },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "dup",
      },
    );
    expect(result.kind).toBe("guest_message_limit_reached");
    expect(state.rollbacks).toHaveLength(1);
  });

  it("maps any insert/usage/commit failure to persistence_failed and rolls back", async () => {
    for (const key of ["failInsert", "failUsage", "failCommit"] as const) {
      const { state } = fresh({ [key]: true });
      const result = await submitGuestMessage(
        { txRepo: makeTxRepo(state) },
        {
          event: state.events["evt-active"],
          session: Object.values(state.sessions)[0],
          messageText: "hi",
        },
      );
      expect(result.kind).toBe("persistence_failed");
      expect(state.rollbacks).toHaveLength(1);
    }
  });

  it("maps a failed BEGIN to persistence_failed", async () => {
    const { state } = fresh({ failBegin: true });
    const result = await submitGuestMessage(
      { txRepo: makeTxRepo(state) },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "hi",
      },
    );
    expect(result.kind).toBe("persistence_failed");
  });

  it("ignores the UX-only pre-check and still inserts (constraint is authoritative)", async () => {
    const { state } = fresh({ existingGuestMessage: true });
    const result = await submitGuestMessage(
      { txRepo: makeTxRepo(state) },
      {
        event: state.events["evt-active"],
        session: Object.values(state.sessions)[0],
        messageText: "hi",
      },
    );
    // The orchestrator does not short-circuit on the pre-check; only the
    // unique constraint may reject the second submission.
    expect(result.kind).toBe("ok");
  });
});
