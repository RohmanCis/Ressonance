import { describe, expect, it } from "vitest";

import { generateSessionToken, hashSessionToken, type GuestSession } from "@/lib/guest-session";
import type { AudioInspector, AudioInspection } from "@/lib/audio-inspector";
import type { VoiceNoteFileConfig } from "@/lib/audio-file";
import type { VoiceNoteStorage } from "@/lib/voice-note-storage";
import {
  type VoiceNoteTxRepo,
  VoiceNoteUniqueViolationError,
} from "@/lib/voice-note-tx-repo";
import {
  submitVoiceNote,
} from "@/lib/submit-voice-note";

/** Opaque bytes that pass the empty/size pre-check (ffprobe decides format). */
function audioBytes(size = 40): Uint8Array {
  return new Uint8Array(size).fill(0x41);
}

/** Build a fake inspector returning a controlled inspection result. */
function makeInspector(
  inspection: AudioInspection,
): AudioInspector {
  return {
    async inspect() {
      return inspection;
    },
  };
}

interface State {
  events: Record<string, { id: string; status: string }>;
  sessions: Record<string, GuestSession>;
  photoCounts: Record<string, number>;
  failBegin?: boolean;
  failUpload?: boolean;
  failInsert?: boolean;
  failCommit?: boolean;
  failPhotoCount?: boolean;
  /** What the fake inspector returns. */
  inspection: AudioInspection;
  /** Overrides the event status observed inside the transaction (QA-2 #3). */
  txEventStatus?: string;
  uploads: { key: string; size: number }[];
  deletes: string[];
  rollbacks: string[];
  inserted: { sessionId: string; storageKey: string; fileSize: number; durationSeconds: number }[];
}

function makeTxRepo(state: State): VoiceNoteTxRepo {
  return {
    async begin(sessionId, eventId) {
      if (state.failBegin) throw new Error("begin failed");
      const eventStatus = state.txEventStatus ?? state.events[eventId]?.status ?? "ACTIVE";
      return {
        eventStatus,
        async insertVoiceNote(input) {
          if (state.failInsert) throw new Error("insert failed");
          state.inserted.push(input);
          return { id: "media-1", created_at: "2026-08-11T12:16:04Z" };
        },
        async countPhotos(sid) {
          if (state.failPhotoCount) throw new Error("photo count failed");
          return state.photoCounts[sid] ?? 0;
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

function makeStorage(state: State): VoiceNoteStorage {
  return {
    async upload(key, data) {
      if (state.failUpload) throw new Error("upload failed");
      state.uploads.push({ key, size: data.length });
    },
    async delete(key) {
      state.deletes.push(key);
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
    photoCounts: {},
    inspection: { status: "ok", durationSeconds: 12, formatName: "webm" },
    uploads: [],
    deletes: [],
    rollbacks: [],
    inserted: [],
    ...overrides,
  };
  return { state, rawToken: token };
}

const config: VoiceNoteFileConfig = { maxSizeBytes: 1000 };

function depsOf(state: State) {
  return {
    txRepo: makeTxRepo(state),
    storage: makeStorage(state),
    inspector: makeInspector(state.inspection),
    config,
  };
}

/** Pre-resolved active-event input for submitVoiceNote submission tests. */
function activeInput(state: State, data: Uint8Array) {
  return {
    event: state.events["evt-active"],
    session: Object.values(state.sessions)[0],
    data,
  };
}

describe("submitVoiceNote", () => {
  it("accepts a valid voice note and returns the exact submission + usage shape", async () => {
    const { state } = fresh();
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.submission).toEqual({
      id: "media-1",
      type: "VOICE_NOTE",
      created_at: "2026-08-11T12:16:04Z",
      mime_type: "audio/webm",
      file_size: 40,
      duration_seconds: 12,
    });
    expect(result.usage).toEqual({
      photos_submitted: 0,
      photos_remaining: 5,
      voice_note_submitted: true,
      voice_note_available: false,
    });
    expect(state.uploads).toHaveLength(1);
    expect(state.rollbacks).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it("stores the rounded duration and reflects existing photos in usage", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 12.6, formatName: "ogg" },
      photoCounts: { "session-1": 2 },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.submission.duration_seconds).toBe(13);
    expect(result.submission.mime_type).toBe("audio/ogg");
    expect(result.usage).toEqual({
      photos_submitted: 2,
      photos_remaining: 3,
      voice_note_submitted: true,
      voice_note_available: false,
    });
    expect(state.inserted[0].durationSeconds).toBe(13);
  });

  it("does not expose the token, DB PK, or storage key on success", async () => {
    const { state, rawToken } = fresh();
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const json = JSON.stringify(result);
    expect(json).not.toContain(rawToken);
    expect(json).not.toContain("session_token");
    expect(json).not.toContain("session-1");
    expect(json).not.toContain("event-1");
    expect(json).not.toContain(state.uploads[0].key);
  });

  it("returns invalid_request for empty bytes", async () => {
    const { state } = fresh();
    const result = await submitVoiceNote(depsOf(state), activeInput(state, new Uint8Array(0)));
    expect(result.kind).toBe("invalid_request");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns file_too_large above the configured size limit", async () => {
    const { state } = fresh();
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes(2000)));
    expect(result.kind).toBe("file_too_large");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns audio_uninspectable when ffprobe cannot inspect the file", async () => {
    const { state } = fresh({ inspection: { status: "uninspectable" } });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("audio_uninspectable");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns unsupported_media for an unrecognized ffprobe format_name", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 12, formatName: "flac" },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("unsupported_media");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns audio_duration_invalid below 5 seconds", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 4.9, formatName: "webm" },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("audio_duration_invalid");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns audio_duration_invalid over 30 seconds", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 30.5, formatName: "webm" },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("audio_duration_invalid");
    expect(state.uploads).toHaveLength(0);
  });

  it("accepts exactly the 5s boundary (inclusive)", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 5, formatName: "webm" },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("ok");
  });

  it("accepts exactly the 30s boundary (inclusive)", async () => {
    const { state } = fresh({
      inspection: { status: "ok", durationSeconds: 30, formatName: "webm" },
    });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("ok");
  });

  it("returns voice_note_limit_reached when the unique constraint fires, compensating the uploaded object", async () => {
    const { state } = fresh();
    const txRepo = makeTxRepo(state);
    txRepo.begin = async () => {
      const base = await makeTxRepo(state).begin("session-1", "event-1");
      return {
        ...base,
        async insertVoiceNote() {
          throw new VoiceNoteUniqueViolationError("uq_voice_notes_one_per_session");
        },
      };
    };
    const result = await submitVoiceNote(
      { ...depsOf(state), txRepo },
      activeInput(state, audioBytes()),
    );
    expect(result.kind).toBe("voice_note_limit_reached");
    expect(state.rollbacks).toContain("session-1");
    expect(state.uploads).toHaveLength(1);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });

  it("returns event_closed when the event is closed under the lock", async () => {
    const { state } = fresh();
    state.txEventStatus = "CLOSED"; // event closed between auth and the transaction
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("event_closed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.uploads).toHaveLength(0);
  });

  it("maps a transaction begin/lock failure to media_persistence_failed", async () => {
    const { state } = fresh({ failBegin: true });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.uploads).toHaveLength(0);
  });

  it("rolls back and returns media_persistence_failed on upload failure, compensating the partial object", async () => {
    const { state } = fresh({ failUpload: true });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.inserted).toHaveLength(0);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toMatch(/^events\//);
  });

  it("rolls back and deletes the uploaded object on metadata insert failure", async () => {
    const { state } = fresh({ failInsert: true });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.uploads).toHaveLength(1);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });

  it("rolls back and deletes the uploaded object on commit failure", async () => {
    const { state } = fresh({ failCommit: true });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });

  it("rolls back and deletes the uploaded object on photo-count failure", async () => {
    const { state } = fresh({ failPhotoCount: true });
    const result = await submitVoiceNote(depsOf(state), activeInput(state, audioBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });
});