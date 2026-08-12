import { describe, expect, it } from "vitest";

import { generateSessionToken, hashSessionToken, type GuestSession } from "@/lib/guest-session";
import type { PhotoFileConfig } from "@/lib/photo-file";
import type { PhotoStorage } from "@/lib/photo-storage";
import type { PhotoTxRepo } from "@/lib/photo-tx-repo";
import {
  PHOTO_LIMIT,
  resolvePhotoAuth,
  submitPhoto,
  type PhotoSession,
} from "@/lib/submit-photo";

/** Minimal but structurally plausible JPEG header (FF D8 FF ...). */
function jpegBytes(size = 20): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

/** Opaque bytes that must be rejected (not any approved magic). */
function fakeBytes(size = 20): Uint8Array {
  return new Uint8Array(size).fill(0x41);
}

interface State {
  events: Record<string, { id: string; status: string }>;
  sessions: Record<string, GuestSession>;
  counts: Record<string, number>;
  voiceCounts: Record<string, number>;
  failBegin?: boolean;
  failUpload?: boolean;
  failInsert?: boolean;
  failCommit?: boolean;
  failVoiceCount?: boolean;
  /** Overrides the event status observed inside the transaction (QA-1 #8). */
  txEventStatus?: string;
  uploads: { key: string; size: number }[];
  deletes: string[];
  rollbacks: string[];
  inserted: { sessionId: string; storageKey: string; fileSize: number }[];
}

function makeSessionRepo(state: State): PhotoSession {
  return {
    async findEventByPublicId(pid) {
      return state.events[pid] ?? null;
    },
    async findSessionByTokenHash(hash) {
      return state.sessions[hash] ?? null;
    },
  };
}

function makeTxRepo(state: State): PhotoTxRepo {
  return {
    async begin(sessionId, eventId) {
      if (state.failBegin) throw new Error("begin failed");
      const count = state.counts[sessionId] ?? 0;
      const eventStatus = state.txEventStatus ?? state.events[eventId]?.status ?? "ACTIVE";
      return {
        eventStatus,
        count,
        async insertPhoto(input) {
          if (state.failInsert) throw new Error("insert failed");
          state.counts[sessionId] = count + 1;
          state.inserted.push(input);
          return { id: "media-1", created_at: "2026-08-11T12:15:21Z" };
        },
        async countVoiceNotes(sid) {
          if (state.failVoiceCount) throw new Error("voice count failed");
          return state.voiceCounts[sid] ?? 0;
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

function makeStorage(state: State): PhotoStorage {
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

function fresh(): { state: State; rawToken: string } {
  const token = generateSessionToken();
  const session: GuestSession = {
    id: "session-1",
    event_id: "event-1",
    session_token: hashSessionToken(token),
    guest_name: "Fante",
  };
  const state: State = {
    events: {
      "evt-active": { id: "event-1", status: "ACTIVE" },
      "evt-closed": { id: "event-2", status: "CLOSED" },
    },
    sessions: { [session.session_token]: session },
    counts: { "session-1": 0 },
    voiceCounts: {},
    uploads: [],
    deletes: [],
    rollbacks: [],
    inserted: [],
  };
  return { state, rawToken: token };
}

const config: PhotoFileConfig = { maxSizeBytes: 1000 };

function depsOf(state: State) {
  return {
    sessionRepo: makeSessionRepo(state),
    txRepo: makeTxRepo(state),
    storage: makeStorage(state),
    config,
  };
}

/** Pre-resolved active-event input for submitPhoto submission tests. */
function activeInput(state: State, data: Uint8Array) {
  return {
    event: state.events["evt-active"],
    session: Object.values(state.sessions)[0],
    data,
  };
}

describe("resolvePhotoAuth", () => {
  it("resolves an ACTIVE event and its session", async () => {
    const { state, rawToken } = fresh();
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-active",
      cookieValue: rawToken,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.event).toEqual({ id: "event-1", status: "ACTIVE" });
    expect(result.session.id).toBe("session-1");
  });

  it("returns not_found for an unknown event", async () => {
    const { state } = fresh();
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-missing",
      cookieValue: "whatever-12345678",
    });
    expect(result.kind).toBe("not_found");
  });

  it("returns event_closed for a CLOSED event", async () => {
    const { state } = fresh();
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-closed",
      cookieValue: "whatever-12345678",
    });
    expect(result.kind).toBe("event_closed");
  });

  it("returns session_required when no cookie", async () => {
    const { state } = fresh();
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-active",
      cookieValue: undefined,
    });
    expect(result.kind).toBe("session_required");
  });

  it("returns session_invalid for an unknown token", async () => {
    const { state } = fresh();
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-active",
      cookieValue: "unknown-token-123456",
    });
    expect(result.kind).toBe("session_invalid");
  });

  it("returns session_invalid for a session of another event", async () => {
    const { state, rawToken } = fresh();
    state.sessions[Object.keys(state.sessions)[0]].event_id = "event-2";
    const result = await resolvePhotoAuth(makeSessionRepo(state), {
      publicId: "evt-active",
      cookieValue: rawToken,
    });
    expect(result.kind).toBe("session_invalid");
  });
});

describe("submitPhoto", () => {
  it("accepts a valid photo and returns the exact submission + usage shape", async () => {
    const { state } = fresh();
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.submission).toEqual({
      id: "media-1",
      type: "PHOTO",
      created_at: "2026-08-11T12:15:21Z",
      mime_type: "image/jpeg",
      file_size: 20,
    });
    expect(result.usage).toEqual({
      photos_submitted: 1,
      photos_remaining: 4,
      voice_note_submitted: false,
      voice_note_available: true,
    });
    expect(state.uploads).toHaveLength(1);
    expect(state.rollbacks).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it("does not expose the token, DB PK, or storage key on success", async () => {
    const { state, rawToken } = fresh();
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
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
    const result = await submitPhoto(depsOf(state), activeInput(state, new Uint8Array(0)));
    expect(result.kind).toBe("invalid_request");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns unsupported_media for unrecognized bytes", async () => {
    const { state } = fresh();
    const result = await submitPhoto(depsOf(state), activeInput(state, fakeBytes()));
    expect(result.kind).toBe("unsupported_media");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns unsupported_media for truncated bytes shorter than any magic header", async () => {
    const { state } = fresh();
    const truncated = new Uint8Array(6);
    truncated[0] = 0xff;
    truncated[1] = 0xd8;
    truncated[2] = 0xff;
    const result = await submitPhoto(depsOf(state), activeInput(state, truncated));
    expect(result.kind).toBe("unsupported_media");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns file_too_large above the configured size limit", async () => {
    const { state } = fresh();
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes(2000)));
    expect(result.kind).toBe("file_too_large");
    expect(state.uploads).toHaveLength(0);
  });

  it("returns photo_limit_reached at the 6th photo and does not upload", async () => {
    const { state } = fresh();
    state.counts["session-1"] = PHOTO_LIMIT;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("photo_limit_reached");
    expect(state.uploads).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("returns event_closed when the event is closed under the lock", async () => {
    const { state } = fresh();
    state.txEventStatus = "CLOSED"; // event closed between auth and the transaction
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("event_closed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.uploads).toHaveLength(0);
  });

  it("maps a transaction begin/lock/count failure to media_persistence_failed", async () => {
    const { state } = fresh();
    state.failBegin = true;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.uploads).toHaveLength(0);
  });

  it("rolls back and returns media_persistence_failed on upload failure, compensating the partial object", async () => {
    const { state } = fresh();
    state.failUpload = true;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.inserted).toHaveLength(0);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toMatch(/^events\//);
  });

  it("rolls back and deletes the uploaded object on metadata insert failure", async () => {
    const { state } = fresh();
    state.failInsert = true;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.uploads).toHaveLength(1);
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });

  it("rolls back and deletes the uploaded object on commit failure", async () => {
    const { state } = fresh();
    state.failCommit = true;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("media_persistence_failed");
    expect(state.rollbacks).toContain("session-1");
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toBe(state.uploads[0].key);
  });

  it("reflects the actual voice-note state in the success usage", async () => {
    const { state } = fresh();
    state.voiceCounts["session-1"] = 1;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.usage.voice_note_submitted).toBe(true);
    expect(result.usage.voice_note_available).toBe(false);
  });

  it("allows success when a voice note already exists (not a photo limit)", async () => {
    const { state } = fresh();
    state.voiceCounts["session-1"] = 1;
    const result = await submitPhoto(depsOf(state), activeInput(state, jpegBytes()));
    expect(result.kind).toBe("ok");
  });
});