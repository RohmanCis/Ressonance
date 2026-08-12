import {
  type GuestSession,
} from "@/lib/guest-session";
import { resolveGuestSession } from "@/lib/resolve-guest-session";

/**
 * GET /api/events/{public_id}/session orchestration (T005).
 *
 * Pure, testable usage-state logic. The database is injected through
 * `UsageRepo`, so the endpoint can run against Supabase while tests use an
 * in-memory fake. Covers: opaque event resolution (404), cookie/session
 * resolution (401 SESSION_REQUIRED / SESSION_INVALID), event ownership, and
 * the exact API Contract Guest usage shape with photo/voice counts. No expiry
 * / rate limiting (open).
 */

export interface UsageEvent {
  id: string;
  public_id: string;
  title: string;
  status: string;
}

export interface UsageRepo {
  findEventByPublicId(publicId: string): Promise<UsageEvent | null>;
  findSessionByTokenHash(hash: string): Promise<GuestSession | null>;
  countPhotos(sessionId: string): Promise<number>;
  countVoiceNotes(sessionId: string): Promise<number>;
}

export interface UsageBody {
  event: { public_id: string; title: string; status: string };
  guest_name: string | null;
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

export type GetUsageResult =
  | { kind: "not_found" }
  | { kind: "session_required" }
  | { kind: "session_invalid" }
  | { kind: "ok"; body: UsageBody };

const PHOTO_LIMIT = 5;

export async function getSessionUsage(
  repo: UsageRepo,
  input: { publicId: string; cookieValue: string | undefined },
): Promise<GetUsageResult> {
  const event = await repo.findEventByPublicId(input.publicId);
  if (!event) return { kind: "not_found" };

  const resolved = await resolveGuestSession(
    repo,
    input.cookieValue,
    event.id,
  );

  switch (resolved.kind) {
    case "missing":
      return { kind: "session_required" };
    case "invalid":
    case "not_found":
    case "wrong_event":
      // No session-expiry policy yet, so invalid/unknown/mismatched all map to
      // SESSION_INVALID; the caller clears the cookie on these.
      return { kind: "session_invalid" };
    case "ok": {
      const [photoCount, voiceCount] = await Promise.all([
        repo.countPhotos(resolved.session.id),
        repo.countVoiceNotes(resolved.session.id),
      ]);
      return {
        kind: "ok",
        body: {
          event: {
            public_id: input.publicId,
            title: event.title,
            status: event.status,
          },
          guest_name: resolved.session.guest_name,
          photos_submitted: photoCount,
          photos_remaining: Math.max(0, PHOTO_LIMIT - photoCount),
          voice_note_submitted: voiceCount > 0,
          voice_note_available: voiceCount === 0,
        },
      };
    }
  }
}