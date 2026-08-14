/**
 * Scheduled media cleanup for the approved retention policy (owner decision
 * 2026-08-15): media is retained 7 days after an event is CLOSED, then
 * deleted — private Storage objects first, `photos`/`voice_notes` metadata
 * rows only after their object deletion succeeded. Internal operational path
 * (API Contract §7.1); invoked daily by Vercel Cron via
 * /api/cron/media-cleanup.
 *
 * Safety rules: never delete metadata before its object is deleted; missing /
 * already-deleted objects count as success (idempotent retry); ACTIVE events,
 * guest sessions, and event records are never touched; one invocation is
 * bounded to MAX_EVENTS_PER_RUN events.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const RETENTION_DAYS = 7;
export const MAX_EVENTS_PER_RUN = 10;

export interface CleanupMediaRef {
  id: string;
  storage_key: string;
}

export interface CleanupEventMedia {
  photos: CleanupMediaRef[];
  voiceNotes: CleanupMediaRef[];
}

export interface CleanupDb {
  /** IDs of CLOSED events with `closed_at` older than the cutoff, bounded by limit. */
  findExpiredClosedEvents(cutoffIso: string, limit: number): Promise<string[]>;
  /** Photo/voice metadata for one event, resolved through its guest sessions. */
  findMediaByEvent(eventId: string): Promise<CleanupEventMedia>;
  deletePhotoMetadata(ids: string[]): Promise<void>;
  deleteVoiceNoteMetadata(ids: string[]): Promise<void>;
}

export interface CleanupStorage {
  /** Delete objects by key. Already-missing objects must be treated as success. */
  remove(keys: string[]): Promise<void>;
}

export interface CleanupFailure {
  eventId: string;
  stage: "storage" | "metadata";
  error: string;
}

export interface CleanupResult {
  eventsScanned: number;
  objectsDeleted: number;
  photosMetadataDeleted: number;
  voiceNotesMetadataDeleted: number;
  failures: CleanupFailure[];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runMediaCleanup(
  db: CleanupDb,
  storage: CleanupStorage,
  now: () => number = Date.now,
): Promise<CleanupResult> {
  const cutoff = new Date(now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result: CleanupResult = {
    eventsScanned: 0,
    objectsDeleted: 0,
    photosMetadataDeleted: 0,
    voiceNotesMetadataDeleted: 0,
    failures: [],
  };

  let eventIds: string[];
  try {
    eventIds = await db.findExpiredClosedEvents(cutoff.toISOString(), MAX_EVENTS_PER_RUN);
  } catch (err) {
    // Surface as a metadata-stage failure on a synthetic id; keeps the shape simple.
    result.failures.push({ eventId: "(event-scan)", stage: "metadata", error: errorMessage(err) });
    return result;
  }
  result.eventsScanned = eventIds.length;

  for (const eventId of eventIds) {
    let media: CleanupEventMedia;
    try {
      media = await db.findMediaByEvent(eventId);
    } catch (err) {
      result.failures.push({ eventId, stage: "metadata", error: errorMessage(err) });
      continue;
    }

    const keys = [...media.photos, ...media.voiceNotes].map((m) => m.storage_key);
    if (keys.length === 0) continue; // nothing retained for this event

    try {
      // Storage first; a missing object is not an error (idempotent retry).
      await storage.remove(keys);
      result.objectsDeleted += keys.length;
    } catch (err) {
      result.failures.push({ eventId, stage: "storage", error: errorMessage(err) });
      continue; // metadata only after successful object deletion
    }

    try {
      if (media.photos.length > 0) await db.deletePhotoMetadata(media.photos.map((p) => p.id));
      if (media.voiceNotes.length > 0) {
        await db.deleteVoiceNoteMetadata(media.voiceNotes.map((v) => v.id));
      }
      result.photosMetadataDeleted += media.photos.length;
      result.voiceNotesMetadataDeleted += media.voiceNotes.length;
    } catch (err) {
      // Objects are gone; metadata remains and a retry will clean it up.
      result.failures.push({ eventId, stage: "metadata", error: errorMessage(err) });
    }
  }

  return result;
}

/** Supabase (service-role) adapter for CleanupDb. */
export function createSupabaseCleanupDb(db: SupabaseClient): CleanupDb {
  return {
    async findExpiredClosedEvents(cutoffIso, limit) {
      const { data, error } = await db
        .from("events")
        .select("id")
        .eq("status", "CLOSED")
        .lt("closed_at", cutoffIso)
        .order("closed_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },

    async findMediaByEvent(eventId) {
      const { data: sessions, error: sessionError } = await db
        .from("guest_sessions")
        .select("id")
        .eq("event_id", eventId);
      if (sessionError) throw sessionError;
      const sessionIds = ((sessions ?? []) as { id: string }[]).map((s) => s.id);
      if (sessionIds.length === 0) return { photos: [], voiceNotes: [] };

      const [photoRes, voiceRes] = await Promise.all([
        db.from("photos").select("id, storage_key").in("guest_session_id", sessionIds),
        db.from("voice_notes").select("id, storage_key").in("guest_session_id", sessionIds),
      ]);
      if (photoRes.error) throw photoRes.error;
      if (voiceRes.error) throw voiceRes.error;
      return {
        photos: (photoRes.data ?? []) as CleanupMediaRef[],
        voiceNotes: (voiceRes.data ?? []) as CleanupMediaRef[],
      };
    },

    async deletePhotoMetadata(ids) {
      const { error } = await db.from("photos").delete().in("id", ids);
      if (error) throw error;
    },

    async deleteVoiceNoteMetadata(ids) {
      const { error } = await db.from("voice_notes").delete().in("id", ids);
      if (error) throw error;
    },
  };
}

/** Supabase Storage adapter. `remove` on missing keys succeeds (S3-like). */
export function createSupabaseCleanupStorage(
  client: SupabaseClient,
  bucket: string,
): CleanupStorage {
  return {
    async remove(keys) {
      const { error } = await client.storage.from(bucket).remove(keys);
      if (error) throw error;
    },
  };
}
