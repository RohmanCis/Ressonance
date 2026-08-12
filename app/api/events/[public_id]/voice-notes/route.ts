import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { loadVoiceNoteFileConfig } from "@/lib/audio-file";
import { createFfprobeAudioInspector } from "@/lib/audio-inspector";
import { getServerConfig } from "@/lib/config";
import { getPgPool } from "@/lib/db";
import { clearGuestSessionCookie, GUEST_SESSION_COOKIE } from "@/lib/guest-session";
import {
  extractBoundary,
  extractMultipartFieldBytes,
  multipartBodyCap,
  readBoundedBody,
} from "@/lib/multipart-photo";
import {
  FixedWindowRateLimiter,
  rateLimitIdentity,
} from "@/lib/rate-limit";
import {
  resolveVoiceNoteAuth,
  submitVoiceNote,
  type VoiceNoteSession,
} from "@/lib/submit-voice-note";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createVoiceNoteStorage } from "@/lib/voice-note-storage";
import { createVoiceNoteTxRepo } from "@/lib/voice-note-tx-repo";

export const runtime = "nodejs";

// Voice-note submission rate limit (API Contract §3 Rate limits / ADR-008).
const voiceNoteRateLimiter = new FixedWindowRateLimiter(loadVoiceNoteRateLimitConfig());

function loadVoiceNoteRateLimitConfig() {
  // Voice-note-specific env names with conservative defaults; do not invent
  // canonical values (task.md: configurable, follows lib/rate-limit pattern).
  const max = Number(process.env.VOICE_NOTE_RATE_LIMIT_MAX ?? 10);
  const windowSeconds = Number(process.env.VOICE_NOTE_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 10,
    windowMs: (Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60) * 1000,
  };
}

function rateLimitKey(request: NextRequest): string {
  return rateLimitIdentity(
    (name) => request.headers.get(name),
    process.env.TRUSTED_PROXY === "1",
  );
}

/**
 * POST /api/events/{public_id}/voice-notes — Submit voice note (API Contract 6.5).
 * Server-side only. Order: content-type → authorize event + guest session →
 * rate limit → bounded body read → extract `voice_note` → byte validation →
 * ffprobe inspection (format + duration) → upload transaction.
 * Unauthenticated/unknown/wrong-event and rate-limited requests never read the
 * body. The body is read incrementally with a hard cap
 * (`maxSizeBytes + overhead`) so oversized requests are not fully buffered.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Content-Type must be multipart/form-data." } },
      { status: 400 },
    );
  }

  const config = getServerConfig();
  const db = createServiceRoleClient() as unknown as SupabaseClient;
  const storage = createVoiceNoteStorage(db, config.supabaseStorageBucket);
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const txRepo = createVoiceNoteTxRepo(client);

    // Session/event lookup via the same transaction client.
    const sessionRepo: VoiceNoteSession = {
      async findEventByPublicId(pid) {
        const { rows } = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM events WHERE public_id = $1 LIMIT 1",
          [pid],
        );
        return rows[0] ?? null;
      },
      async findSessionByTokenHash(hash) {
        const { rows } = await client.query<{
          id: string;
          event_id: string;
          session_token: string;
          guest_name: string | null;
        }>(
          "SELECT id, event_id, session_token, guest_name FROM guest_sessions WHERE session_token = $1 LIMIT 1",
          [hash],
        );
        return rows[0] ?? null;
      },
    };

    // Authorize before touching the body (QA-2): unknown event, CLOSED status,
    // and missing/invalid/wrong-event cookies are rejected without parsing.
    const auth = await resolveVoiceNoteAuth(sessionRepo, {
      publicId: public_id,
      cookieValue: request.cookies.get(GUEST_SESSION_COOKIE)?.value,
    });

    switch (auth.kind) {
      case "not_found":
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Event not found." } },
          { status: 404 },
        );
      case "event_closed":
        return NextResponse.json(
          { error: { code: "EVENT_CLOSED", message: "This event is closed." } },
          { status: 422 },
        );
      case "session_required":
        return NextResponse.json(
          { error: { code: "SESSION_REQUIRED", message: "A guest session is required." } },
          { status: 401 },
        );
      case "session_invalid": {
        const response = NextResponse.json(
          { error: { code: "SESSION_INVALID", message: "The guest session is invalid." } },
          { status: 401 },
        );
        response.headers.append("Set-Cookie", clearGuestSessionCookie());
        return response;
      }
      case "ok": {
        // Rate limit immediately after authorization, before body parsing (QA-3).
        const rate = voiceNoteRateLimiter.check(rateLimitKey(request));
        if (!rate.allowed) {
          return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many voice-note requests. Try again shortly." } },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
          );
        }

        const fileConfig = loadVoiceNoteFileConfig();
        const bodyCap = multipartBodyCap(fileConfig.maxSizeBytes);

        // Early body-level guard (not vs the file limit) when Content-Length is
        // present; the incremental cap below enforces the same bound while reading.
        const contentLength = request.headers.get("content-length");
        if (contentLength) {
          const len = Number(contentLength);
          if (Number.isFinite(len) && len > bodyCap) {
            return NextResponse.json(
              { error: { code: "FILE_TOO_LARGE", message: "The audio exceeds the size limit." } },
              { status: 422 },
            );
          }
        }
        if (!request.body) {
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "A 'voice_note' file is required." } },
            { status: 400 },
          );
        }

        const boundary = extractBoundary(contentType);
        if (!boundary) {
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "Malformed multipart request body." } },
            { status: 400 },
          );
        }

        let bytes: Uint8Array;
        try {
          const body = await readBoundedBody(request.body, bodyCap);
          if (!body.ok) {
            return NextResponse.json(
              { error: { code: "FILE_TOO_LARGE", message: "The audio exceeds the size limit." } },
              { status: 422 },
            );
          }
          const voiceNote = extractMultipartFieldBytes(body.bytes, "voice_note", boundary);
          if (!voiceNote) {
            return NextResponse.json(
              { error: { code: "INVALID_REQUEST", message: "A 'voice_note' file is required." } },
              { status: 400 },
            );
          }
          bytes = voiceNote;
        } catch {
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "Malformed multipart request body." } },
            { status: 400 },
          );
        }

        const inspector = createFfprobeAudioInspector(
          process.env.FFPROBE_PATH ?? "ffprobe",
        );
        const result = await submitVoiceNote(
          { sessionRepo, txRepo, storage, inspector, config: fileConfig },
          { event: auth.event, session: auth.session, data: bytes },
        );

        switch (result.kind) {
          case "invalid_request":
            return NextResponse.json(
              { error: { code: "INVALID_REQUEST", message: "Request validation failed." } },
              { status: 400 },
            );
          case "event_closed":
            return NextResponse.json(
              { error: { code: "EVENT_CLOSED", message: "This event is closed." } },
              { status: 422 },
            );
          case "unsupported_media":
            return NextResponse.json(
              { error: { code: "UNSUPPORTED_MEDIA", message: "Unsupported audio format." } },
              { status: 422 },
            );
          case "file_too_large":
            return NextResponse.json(
              { error: { code: "FILE_TOO_LARGE", message: "The audio exceeds the size limit." } },
              { status: 422 },
            );
          case "audio_duration_invalid":
            return NextResponse.json(
              { error: { code: "AUDIO_DURATION_INVALID", message: "Voice note must be between 5 and 30 seconds." } },
              { status: 422 },
            );
          case "audio_uninspectable":
            return NextResponse.json(
              { error: { code: "AUDIO_UNINSPECTABLE", message: "Could not inspect the audio file." } },
              { status: 422 },
            );
          case "voice_note_limit_reached":
            return NextResponse.json(
              { error: { code: "VOICE_NOTE_LIMIT_REACHED", message: "Voice note already submitted for this guest session." } },
              { status: 409 },
            );
          case "media_persistence_failed":
            return NextResponse.json(
              { error: { code: "MEDIA_PERSISTENCE_FAILED", message: "Could not persist the voice note." } },
              { status: 502 },
            );
          case "ok":
            return NextResponse.json(
              { submission: result.submission, usage: result.usage },
              { status: 201 },
            );
        }
      }
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}