import type { SupabaseClient } from "@supabase/supabase-js";

import type { CleanupStorage } from "@/lib/media-cleanup";

/**
 * Hard delete of a CLOSED event (API Contract §5.12).
 *
 * All foreign keys are ON DELETE RESTRICT (docs/db_scheme.md), so rows are
 * deleted child-first: photos → voice_notes → guest_sessions → events.
 * Storage keys are read from the metadata rows (built from the DB event id,
 * never public_id — API Contract §8.4) and their objects are removed BEFORE
 * the rows, mirroring lib/media-cleanup.ts: a storage failure leaves every DB
 * row intact so the admin can retry, and a missing/already-deleted object is
 * success (S3-like).
 */
export type DeleteEventResult =
  | { kind: "ok" }
  | { kind: "active_event" }
  | { kind: "not_found" }
  | { kind: "error" };

export async function deleteAdminEvent(
  db: SupabaseClient,
  storage: CleanupStorage,
  publicId: string,
): Promise<DeleteEventResult> {
  const { data: event, error: eventError } = await db
    .from("events")
    .select("id, status")
    .eq("public_id", publicId)
    .maybeSingle();
  if (eventError) return { kind: "error" };
  if (!event) return { kind: "not_found" };
  const { id: eventId, status } = event as { id: string; status: string };
  if (status === "ACTIVE") return { kind: "active_event" };

  const { data: sessions, error: sessionError } = await db
    .from("guest_sessions")
    .select("id")
    .eq("event_id", eventId);
  if (sessionError) return { kind: "error" };
  const sessionIds = ((sessions ?? []) as { id: string }[]).map((s) => s.id);

  const keys: string[] = [];
  if (sessionIds.length > 0) {
    const [photoRes, voiceRes] = await Promise.all([
      db.from("photos").select("id, storage_key").in("guest_session_id", sessionIds),
      db.from("voice_notes").select("id, storage_key").in("guest_session_id", sessionIds),
    ]);
    if (photoRes.error || voiceRes.error) return { kind: "error" };
    keys.push(
      ...((photoRes.data ?? []) as { storage_key: string }[]).map((p) => p.storage_key),
      ...((voiceRes.data ?? []) as { storage_key: string }[]).map((v) => v.storage_key),
    );
  }

  // Storage first; failure here returns error with all DB rows intact.
  if (keys.length > 0) {
    try {
      await storage.remove(keys);
    } catch {
      return { kind: "error" };
    }
  }

  // Child-first (ON DELETE RESTRICT).
  if (sessionIds.length > 0) {
    const { error: photoError } = await db.from("photos").delete().in("guest_session_id", sessionIds);
    if (photoError) return { kind: "error" };
    const { error: voiceError } = await db
      .from("voice_notes")
      .delete()
      .in("guest_session_id", sessionIds);
    if (voiceError) return { kind: "error" };
    const { error: sessionDeleteError } = await db
      .from("guest_sessions")
      .delete()
      .eq("event_id", eventId);
    if (sessionDeleteError) return { kind: "error" };
  }

  const { error: eventDeleteError } = await db.from("events").delete().eq("public_id", publicId);
  if (eventDeleteError) return { kind: "error" };

  return { kind: "ok" };
}
