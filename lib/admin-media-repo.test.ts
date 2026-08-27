import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findMedia, resolveAuthorizedMedia } from "@/lib/admin-media-repo";
import { createFakeAdminMediaDb, type FakeMediaDbState } from "@/test/admin-media-db";

/**
 * Repository tests for findMedia / resolveAuthorizedMedia (API Contract
 * §§5.7–5.9). The service-role client is replaced with the shared in-memory
 * fake so the UUID guard and media resolution run without a live backend.
 */

const asDb = (db: ReturnType<typeof createFakeAdminMediaDb>) =>
  db as unknown as SupabaseClient;

const PHOTO_ID = "11111111-1111-4111-8111-111111111111";
const VOICE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";

function seed(): FakeMediaDbState {
  return {
    events: [{ id: EVENT_ID, public_id: "evt-1", admin_id: "admin-1" }],
    sessions: [
      { id: SESSION_ID, event_id: EVENT_ID, guest_name: "Fante", public_ref: "ref-s1" },
    ],
    photos: [
      {
        id: PHOTO_ID,
        guest_session_id: SESSION_ID,
        storage_key: "events/e1/sessions/s1/photos/k1.jpg",
        mime_type: "image/jpeg",
        file_size: 100,
        created_at: "2026-08-11T12:15:21Z",
      },
    ],
    voice_notes: [
      {
        id: VOICE_ID,
        guest_session_id: SESSION_ID,
        storage_key: "events/e1/sessions/s1/voices/k2.webm",
        mime_type: "audio/webm",
        file_size: 300,
        duration_seconds: 12,
        created_at: "2026-08-11T12:16:40Z",
      },
    ],
  };
}

describe("findMedia — UUID guard", () => {
  it("returns null for a non-UUID media id (no DB query, no 500)", async () => {
    const db = createFakeAdminMediaDb(seed());
    const result = await findMedia(asDb(db), "not-a-uuid");
    expect(result).toBeNull();
  });

  it("returns null for a partially-UUID-shaped string", async () => {
    const db = createFakeAdminMediaDb(seed());
    expect(await findMedia(asDb(db), "11111111-1111-4111-8111")).toBeNull();
    expect(await findMedia(asDb(db), "1111111111114111811111111111111111")).toBeNull();
  });

  it("returns null for a valid UUID that does not exist", async () => {
    const db = createFakeAdminMediaDb(seed());
    const result = await findMedia(asDb(db), "99999999-9999-4999-8999-999999999999");
    expect(result).toBeNull();
  });

  it("returns the photo for a valid UUID photo id", async () => {
    const db = createFakeAdminMediaDb(seed());
    const result = await findMedia(asDb(db), PHOTO_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.type).toBe("PHOTO");
    expect(result.id).toBe(PHOTO_ID);
    expect(result.duration_seconds).toBeNull();
  });

  it("returns the voice note for a valid UUID voice id", async () => {
    const db = createFakeAdminMediaDb(seed());
    const result = await findMedia(asDb(db), VOICE_ID);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.type).toBe("VOICE_NOTE");
    expect(result.duration_seconds).toBe(12);
  });
});

describe("resolveAuthorizedMedia — UUID guard", () => {
  it("returns not_found for a non-UUID media id", async () => {
    const db = createFakeAdminMediaDb(seed());
    const result = await resolveAuthorizedMedia(asDb(db), "bucket", "garbage", "admin-1");
    expect(result.kind).toBe("not_found");
  });
});
