import { NextRequest, NextResponse } from "next/server";

import { logApiError } from "@/lib/api-log";
import { getPgPool } from "@/lib/db";
import { createGuestMessageTxRepo } from "@/lib/guest-message-tx-repo";
import { clearGuestSessionCookie, GUEST_SESSION_COOKIE } from "@/lib/guest-session";
import { FixedWindowRateLimiter, rateLimitIdentity } from "@/lib/rate-limit";
import { readBoundedBody } from "@/lib/multipart-photo";
import {
  resolveVoiceNoteAuth,
  type VoiceNoteSession,
} from "@/lib/submit-voice-note";
import { submitGuestMessage } from "@/lib/submit-guest-message";

export const runtime = "nodejs";

// Guest-message submission rate limit (API Contract §3 Rate limits / ADR-008).
// Same in-memory fixed-window pattern as voice notes.
const guestMessageRateLimiter = new FixedWindowRateLimiter(loadGuestMessageRateLimitConfig());

/** Hard cap on the buffered JSON body; 4 KB is ample for 280 characters. */
const JSON_BODY_CAP_BYTES = 4 * 1024;

function loadGuestMessageRateLimitConfig() {
  // Guest-message-specific env names with conservative defaults; follows the
  // voice-note pattern (configurable, not invented canonical values).
  const max = Number(process.env.GUEST_MESSAGE_RATE_LIMIT_MAX ?? 10);
  const windowSeconds = Number(process.env.GUEST_MESSAGE_RATE_LIMIT_WINDOW_SECONDS ?? 60);
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
 * POST /api/events/{public_id}/guest-messages — Submit guest message
 * (API Contract 6.6, Opsi B). Server-side only. Order: content-type →
 * authorize event + guest session → rate limit → bounded JSON body read →
 * validate `message_text` → insert transaction.
 * Unauthenticated/unknown/wrong-event and rate-limited requests never read
 * the body. The body is read incrementally with a hard 4 KB cap so oversized
 * requests are not fully buffered.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  // JSON request expectation (API Contract §1). Missing/wrong content type → 400.
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Content-Type must be application/json." } },
      { status: 400 },
    );
  }

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const txRepo = createGuestMessageTxRepo(client);

    // Session/event lookup via the same transaction client. Auth reuses
    // resolveVoiceNoteAuth — the event + guest-session authorization is
    // identical for every protected guest submission endpoint.
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
          expires_at: string;
        }>(
          "SELECT id, event_id, session_token, guest_name, expires_at FROM guest_sessions WHERE session_token = $1 LIMIT 1",
          [hash],
        );
        return rows[0] ?? null;
      },
    };

    // Authorize before touching the body (QA-2 pattern): unknown event,
    // CLOSED status, and missing/invalid/wrong-event cookies are rejected
    // without parsing.
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
      case "session_expired": {
        const response = NextResponse.json(
          { error: { code: "SESSION_EXPIRED", message: "The guest session has expired." } },
          { status: 401 },
        );
        response.headers.append("Set-Cookie", clearGuestSessionCookie());
        return response;
      }
      case "ok": {
        // Rate limit immediately after authorization, before body parsing (QA-3).
        const rate = guestMessageRateLimiter.check(rateLimitKey(request));
        if (!rate.allowed) {
          return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many guest-message requests. Try again shortly." } },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
          );
        }

        if (!request.body) {
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "A JSON body is required." } },
            { status: 400 },
          );
        }

        // Bounded read: never buffer beyond 4 KB.
        let raw: string;
        try {
          const body = await readBoundedBody(request.body, JSON_BODY_CAP_BYTES);
          if (!body.ok) {
            return NextResponse.json(
              { error: { code: "INVALID_REQUEST", message: "The request body is too large." } },
              { status: 400 },
            );
          }
          raw = new TextDecoder().decode(body.bytes);
        } catch (err) {
          logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "Malformed request body." } },
            { status: 400 },
          );
        }

        let parsed: unknown;
        if (raw.trim().length === 0) {
          parsed = {};
        } else {
          try {
            parsed = JSON.parse(raw);
          } catch (err) {
            logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
            return NextResponse.json(
              { error: { code: "INVALID_REQUEST", message: "Malformed JSON request body." } },
              { status: 400 },
            );
          }
        }

        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json(
            { error: { code: "INVALID_REQUEST", message: "Malformed request body." } },
            { status: 400 },
          );
        }

        const messageText = (parsed as Record<string, unknown>).message_text;

        const result = await submitGuestMessage(
          { txRepo },
          { event: auth.event, session: auth.session, messageText },
        );

        switch (result.kind) {
          case "invalid_input":
            return NextResponse.json(
              {
                error: {
                  code: "INVALID_INPUT",
                  message: "Request validation failed.",
                  fields: result.fields,
                },
              },
              { status: 422 },
            );
          case "event_closed":
            return NextResponse.json(
              { error: { code: "EVENT_CLOSED", message: "This event is closed." } },
              { status: 422 },
            );
          case "guest_message_limit_reached":
            return NextResponse.json(
              { error: { code: "GUEST_MESSAGE_LIMIT_REACHED", message: "Message already submitted for this guest session." } },
              { status: 409 },
            );
          case "persistence_failed":
            return NextResponse.json(
              { error: { code: "INTERNAL_ERROR", message: "Could not persist the message." } },
              { status: 500 },
            );
          case "ok":
            return NextResponse.json(
              { submission: result.submission, usage: result.usage },
              { status: 201 },
            );
        }
      }
    }
  } catch (err) {
    logApiError({ event: "guest_message_submit_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
