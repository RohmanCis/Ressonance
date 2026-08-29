import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin submission listing and private media access (API Contract §§5.7–5.9,
 * TECHNICAL_DESIGN §10).
 *
 * All access flows through the service-role client. Admin auth is validated
 * separately via the SSR client; ownership is checked here against the
 * authenticated admin id. Media is resolved through GuestSession to Event so
 * a `media_id` alone never leaks a storage key or grants cross-event access.
 * No DB primary key beyond the contract media `id`, storage key, public URL,
 * or token is ever returned.
 */

export type MediaType = "PHOTO" | "VOICE_NOTE";

export interface SubmissionListing {
  id: string;
  type: MediaType;
  guest_name: string | null;
  guest_session_ref: string;
  created_at: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number | null;
}

export interface MediaRecord {
  id: string;
  type: MediaType;
  guest_session_id: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number | null;
}

/** Signed URL TTL remains open in the contract; a short-lived default (15 min). */
export const SIGNED_URL_TTL_SECONDS = 900;

type Db = SupabaseClient;

/**
 * UUID format check for media ids. PostgREST errors (→ 500) when a non-UUID
 * value filters a UUID column; a malformed `media_id` must surface as 404
 * NOT_FOUND per API Contract §5.8/§5.9. Checked before any DB query.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Load an event by public_id including its DB id and admin_id for ownership. */
export async function findEventByPublicId(
  db: Db,
  publicId: string,
): Promise<{ id: string; admin_id: string } | null> {
  const { data, error } = await db
    .from("events")
    .select("id, admin_id")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; admin_id: string } | null) ?? null;
}

/** Resolve an event's owning admin by its DB id. */
export async function findEventOwnerById(
  db: Db,
  eventId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("events")
    .select("admin_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data as { admin_id: string } | null)?.admin_id ?? null;
}

/**
 * Resolve a media record by its id across both media tables. Returns the
 * storage_key internally (never exposed to the client) plus the owning
 * GuestSession used to reach the Event.
 */
export async function findMedia(db: Db, mediaId: string): Promise<MediaRecord | null> {
  // Reject non-UUID ids before querying — a malformed id would surface as a
  // PostgREST error (500) instead of the contract's 404 NOT_FOUND (§5.8/§5.9).
  if (!UUID_RE.test(mediaId)) return null;

  const { data: photo, error: photoError } = await db
    .from("photos")
    .select("id, guest_session_id, storage_key, mime_type, file_size")
    .eq("id", mediaId)
    .maybeSingle();
  if (photoError) throw photoError;
  if (photo) {
    return {
      id: photo.id,
      type: "PHOTO",
      guest_session_id: photo.guest_session_id,
      storage_key: photo.storage_key,
      mime_type: photo.mime_type,
      file_size: photo.file_size,
      duration_seconds: null,
    };
  }

  const { data: voice, error: voiceError } = await db
    .from("voice_notes")
    .select("id, guest_session_id, storage_key, mime_type, file_size, duration_seconds")
    .eq("id", mediaId)
    .maybeSingle();
  if (voiceError) throw voiceError;
  if (voice) {
    return {
      id: voice.id,
      type: "VOICE_NOTE",
      guest_session_id: voice.guest_session_id,
      storage_key: voice.storage_key,
      mime_type: voice.mime_type,
      file_size: voice.file_size,
      duration_seconds: voice.duration_seconds,
    };
  }
  return null;
}

/** Resolve the Event a GuestSession belongs to. */
export async function getSessionEventId(
  db: Db,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("guest_sessions")
    .select("event_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as { event_id: string } | null)?.event_id ?? null;
}

/**
 * List all photo/voice submissions for an event, newest first, as a unified
 * metadata array. Optional guest_name filters to sessions whose name contains
 * it case-insensitively (ILIKE; user-typed %/_ are matched literally).
 * Never returns storage_key or a public/signed URL.
 */
export async function listSubmissions(
  db: Db,
  eventId: string,
  guestName?: string,
): Promise<SubmissionListing[]> {
  let sessionQuery = db
    .from("guest_sessions")
    .select("id, guest_name, public_ref")
    .eq("event_id", eventId);
  if (guestName) {
    const pattern = guestName.replace(/[\\%_]/g, "\\$&");
    sessionQuery = sessionQuery.ilike("guest_name", `%${pattern}%`);
  }
  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) throw sessionError;

  const sessionIds = (sessions as { id: string; guest_name: string | null; public_ref: string }[]).map(
    (s) => s.id,
  );
  if (sessionIds.length === 0) return [];

  const photoQuery = db
    .from("photos")
    .select("id, guest_session_id, created_at, mime_type, file_size")
    .in("guest_session_id", sessionIds);
  const voiceQuery = db
    .from("voice_notes")
    .select("id, guest_session_id, created_at, mime_type, file_size, duration_seconds")
    .in("guest_session_id", sessionIds);

  const [photoRes, voiceRes] = await Promise.all([photoQuery, voiceQuery]);
  if (photoRes.error) throw photoRes.error;
  if (voiceRes.error) throw voiceRes.error;

  const nameBySession = new Map(
    (sessions as { id: string; guest_name: string | null; public_ref: string }[]).map((s) => [
      s.id,
      { guest_name: s.guest_name, public_ref: s.public_ref },
    ]),
  );

  const listings: SubmissionListing[] = [];
  for (const p of photoRes.data ?? []) {
    const session = nameBySession.get(p.guest_session_id);
    listings.push({
      id: p.id,
      type: "PHOTO",
      guest_name: session?.guest_name ?? null,
      guest_session_ref: session?.public_ref ?? "",
      created_at: p.created_at,
      mime_type: p.mime_type,
      file_size: p.file_size,
      duration_seconds: null,
    });
  }
  for (const v of voiceRes.data ?? []) {
    const session = nameBySession.get(v.guest_session_id);
    listings.push({
      id: v.id,
      type: "VOICE_NOTE",
      guest_name: session?.guest_name ?? null,
      guest_session_ref: session?.public_ref ?? "",
      created_at: v.created_at,
      mime_type: v.mime_type,
      file_size: v.file_size,
      duration_seconds: v.duration_seconds,
    });
  }

  // Newest first (API Contract §5.7); stable within equal timestamps.
  listings.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return listings;
}

/**
 * Authorize an admin for a media object and produce a signed URL. Resolves
 * media → GuestSession → Event, verifies the authenticated admin owns the
 * event, then signs the private object. Returns a discriminated result so
 * routes map errors without reaching a storage key.
 */
export type MediaAccessResult =
  | { kind: "not_found" | "forbidden" | "access_failed" }
  | { kind: "ok"; url: string; expires_at: string };

export async function resolveAuthorizedMedia(
  db: Db,
  bucket: string,
  mediaId: string,
  adminId: string,
): Promise<MediaAccessResult> {
  const media = await findMedia(db, mediaId);
  if (!media) return { kind: "not_found" };

  const eventId = await getSessionEventId(db, media.guest_session_id);
  if (!eventId) return { kind: "not_found" };

  const ownerId = await findEventOwnerById(db, eventId);
  if (!ownerId) return { kind: "not_found" };
  if (ownerId !== adminId) return { kind: "forbidden" };

  const url = await createSignedMediaUrl(db, bucket, media.storage_key);
  if (!url) return { kind: "access_failed" };
  return { kind: "ok", url: url.url, expires_at: url.expires_at };
}

/** Create a short-lived signed URL for a private object. Null on failure. */
export async function createSignedMediaUrl(
  db: Db,
  bucket: string,
  storageKey: string,
): Promise<{ url: string; expires_at: string } | null> {
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return {
    url: data.signedUrl,
    expires_at: new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}