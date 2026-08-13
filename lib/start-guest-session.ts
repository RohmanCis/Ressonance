import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/guest-session";

/**
 * POST /api/events/{public_id}/session orchestration (T004).
 *
 * Pure, testable session-start logic. The database is injected through
 * `SessionRepo`, so the endpoint can run against Supabase while tests use an
 * in-memory fake. Covers: opaque event resolution, CLOSED rejection, optional
 * name validation, token generation with SHA-256 digest persistence, and the
 * exact API Contract response shape. No rate limiting (route layer). Expiry is
 * DB-managed via the `expires_at` default.
 */

export interface EventRef {
  id: string;
  status: string;
}

export interface GuestSessionRef {
  id: string;
}

export interface SessionRepo {
  findEventByPublicId(publicId: string): Promise<EventRef | null>;
  createGuestSession(input: {
    eventId: string;
    sessionTokenHash: string;
    guestName: string | null;
  }): Promise<GuestSessionRef>;
}

export interface SessionBody {
  event_public_id: string;
  guest_name: string | null;
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

export type StartSessionResult =
  | { kind: "invalid_guest_name"; fields: { guest_name: string } }
  | { kind: "not_found" }
  | { kind: "event_closed" }
  | { kind: "ok"; token: string; body: SessionBody };

const MAX_NAME_LENGTH = 100;

/**
 * Normalize optional guest_name: empty/absent -> anonymous (null);
 * invalid type, too long, or control chars -> invalid.
 */
function normalizeGuestName(
  value: unknown,
): { ok: true; name: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, name: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, name: null };
  if (trimmed.length > MAX_NAME_LENGTH) return { ok: false };
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return { ok: false };
  return { ok: true, name: trimmed };
}

export async function startGuestSession(
  repo: SessionRepo,
  input: { publicId: string; guestName: unknown },
): Promise<StartSessionResult> {
  const name = normalizeGuestName(input.guestName);
  if (!name.ok) {
    return {
      kind: "invalid_guest_name",
      fields: { guest_name: "Guest name is invalid or too long." },
    };
  }

  const event = await repo.findEventByPublicId(input.publicId);
  if (!event) return { kind: "not_found" };

  // Only ACTIVE events accept submissions; any non-ACTIVE destination is
  // rejected (API Contract §3 Closed events).
  if (event.status !== "ACTIVE") return { kind: "event_closed" };

  const token = generateSessionToken();
  await repo.createGuestSession({
    eventId: event.id,
    sessionTokenHash: hashSessionToken(token),
    guestName: name.name,
  });

  return {
    kind: "ok",
    token,
    body: {
      event_public_id: input.publicId,
      guest_name: name.name,
      photos_submitted: 0,
      photos_remaining: 5,
      voice_note_submitted: false,
      voice_note_available: true,
    },
  };
}
