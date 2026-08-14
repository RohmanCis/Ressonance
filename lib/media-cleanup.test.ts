import { describe, expect, it } from "vitest";

import {
  MAX_EVENTS_PER_RUN,
  RETENTION_DAYS,
  runMediaCleanup,
  type CleanupDb,
  type CleanupEventMedia,
  type CleanupStorage,
} from "@/lib/media-cleanup";

/** Fixed "now": 2026-08-15T00:00:00Z. */
const NOW = Date.parse("2026-08-15T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeDb(events: Record<string, CleanupEventMedia>, opts?: { expiredError?: unknown }) {
  const state = {
    expired: [] as string[],
    media: { ...events } as Record<string, CleanupEventMedia>,
    photoDeletes: [] as string[][],
    voiceDeletes: [] as string[][],
  };
  const db: CleanupDb = {
    async findExpiredClosedEvents(cutoffIso, limit) {
      if (opts?.expiredError) throw opts.expiredError;
      // Verify cutoff math: a closed_at exactly RETENTION_DAYS old is expired (lt).
      expect(cutoffIso).toBe(new Date(NOW - RETENTION_DAYS * DAY).toISOString());
      return state.expired.slice(0, limit);
    },
    async findMediaByEvent(eventId) {
      return state.media[eventId] ?? { photos: [], voiceNotes: [] };
    },
    async deletePhotoMetadata(ids) {
      state.photoDeletes.push(ids);
      for (const [k, m] of Object.entries(state.media)) {
        state.media[k] = { ...m, photos: m.photos.filter((p) => !ids.includes(p.id)) };
      }
    },
    async deleteVoiceNoteMetadata(ids) {
      state.voiceDeletes.push(ids);
      for (const [k, m] of Object.entries(state.media)) {
        state.media[k] = { ...m, voiceNotes: m.voiceNotes.filter((v) => !ids.includes(v.id)) };
      }
    },
  };
  return { db, state };
}

function makeStorage() {
  const state = { removed: [] as string[][], error: null as unknown };
  const storage: CleanupStorage = {
    async remove(keys) {
      if (state.error) throw state.error;
      state.removed.push(keys);
    },
  };
  return { storage, state };
}

const MEDIA: CleanupEventMedia = {
  photos: [
    { id: "p1", storage_key: "events/e1/photos/p1.jpg" },
    { id: "p2", storage_key: "events/e1/photos/p2.jpg" },
  ],
  voiceNotes: [{ id: "v1", storage_key: "events/e1/voice-notes/v1.webm" }],
};

describe("runMediaCleanup behavior", () => {
  it("deletes objects then photo+voice metadata for expired CLOSED events", async () => {
    const { db, state } = makeDb({ e1: MEDIA });
    state.expired = ["e1"];
    const { storage, state: st } = makeStorage();

    const res = await runMediaCleanup(db, storage, () => NOW);

    expect(res.failures).toEqual([]);
    expect(res.eventsScanned).toBe(1);
    expect(res.objectsDeleted).toBe(3);
    expect(res.photosMetadataDeleted).toBe(2);
    expect(res.voiceNotesMetadataDeleted).toBe(1);
    // Objects first, all keys in one remove call.
    expect(st.removed).toEqual([["events/e1/photos/p1.jpg", "events/e1/photos/p2.jpg", "events/e1/voice-notes/v1.webm"]]);
    expect(state.photoDeletes).toEqual([["p1", "p2"]]);
    expect(state.voiceDeletes).toEqual([["v1"]]);
  });

  it("does nothing when no event is expired (recent CLOSED / ACTIVE are pre-filtered by the query)", async () => {
    const { db } = makeDb({});
    const { storage, state: st } = makeStorage();
    const res = await runMediaCleanup(db, storage, () => NOW);
    expect(res).toEqual({
      eventsScanned: 0,
      objectsDeleted: 0,
      photosMetadataDeleted: 0,
      voiceNotesMetadataDeleted: 0,
      failures: [],
    });
    expect(st.removed).toEqual([]);
  });

  it("keeps metadata when object deletion fails (never metadata-first)", async () => {
    const { db, state } = makeDb({ e1: MEDIA });
    state.expired = ["e1"];
    const { storage, state: st } = makeStorage();
    st.error = new Error("storage unavailable");

    const res = await runMediaCleanup(db, storage, () => NOW);

    expect(res.failures).toEqual([{ eventId: "e1", stage: "storage", error: "storage unavailable" }]);
    expect(state.photoDeletes).toEqual([]);
    expect(state.voiceDeletes).toEqual([]);
  });

  it("treats a missing/already-deleted object as success and removes metadata (idempotent retry)", async () => {
    const { db, state } = makeDb({ e1: MEDIA });
    state.expired = ["e1"];
    const { storage } = makeStorage();

    const first = await runMediaCleanup(db, storage, () => NOW);
    expect(first.failures).toEqual([]);

    // Second run rescans the same event (still CLOSED >7d) but finds no
    // metadata left — a no-op with no duplicate failure. remove() on missing
    // keys is never even attempted.
    const second = await runMediaCleanup(db, storage, () => NOW);
    expect(second.eventsScanned).toBe(1);
    expect(second.objectsDeleted).toBe(0);
    expect(second.failures).toEqual([]);
  });

  it("repeated cleanup on a metadata-delete failure does not duplicate failures on success", async () => {
    const { db, state } = makeDb({ e1: MEDIA });
    state.expired = ["e1"];
    const { storage } = makeStorage();

    // Force metadata failure: wrap db with a failing photo delete once.
    let failOnce = true;
    const origPhotos = db.deletePhotoMetadata.bind(db);
    db.deletePhotoMetadata = async (ids) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("db reset");
      }
      return origPhotos(ids);
    };

    const first = await runMediaCleanup(db, storage, () => NOW);
    expect(first.failures).toEqual([{ eventId: "e1", stage: "metadata", error: "db reset" }]);
    // Objects were deleted even though metadata failed.
    expect(first.objectsDeleted).toBe(3);

    const second = await runMediaCleanup(db, storage, () => NOW);
    expect(second.failures).toEqual([]);
    expect(second.photosMetadataDeleted).toBe(2);
  });

  it("reports an event-scan failure and deletes nothing", async () => {
    const { db } = makeDb({}, { expiredError: new Error("connection refused") });
    const { storage, state: st } = makeStorage();
    const res = await runMediaCleanup(db, storage, () => NOW);
    expect(res.eventsScanned).toBe(0);
    expect(res.failures).toEqual([{ eventId: "(event-scan)", stage: "metadata", error: "connection refused" }]);
    expect(st.removed).toEqual([]);
  });

  it("bounds one invocation to MAX_EVENTS_PER_RUN events", async () => {
    const media: Record<string, CleanupEventMedia> = {};
    for (let i = 0; i < MAX_EVENTS_PER_RUN + 5; i++) {
      media[`e${i}`] = { photos: [{ id: `p${i}`, storage_key: `k${i}` }], voiceNotes: [] };
    }
    const { db, state } = makeDb(media);
    state.expired = Object.keys(media);
    const { storage } = makeStorage();

    const res = await runMediaCleanup(db, storage, () => NOW);
    expect(res.eventsScanned).toBe(MAX_EVENTS_PER_RUN);
    expect(res.objectsDeleted).toBe(MAX_EVENTS_PER_RUN);
  });

  it("skips events with no retained media", async () => {
    const { db, state } = makeDb({ e1: { photos: [], voiceNotes: [] } });
    state.expired = ["e1"];
    const { storage, state: st } = makeStorage();
    const res = await runMediaCleanup(db, storage, () => NOW);
    expect(res.eventsScanned).toBe(1);
    expect(res.objectsDeleted).toBe(0);
    expect(res.failures).toEqual([]);
    expect(st.removed).toEqual([]);
  });
});
