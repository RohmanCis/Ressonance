import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { logApiError } from "@/lib/api-log";
import { getPgPool } from "@/lib/db";
import {
  clearGuestSessionCookie,
  GUEST_SESSION_COOKIE,
  type GuestSession,
} from "@/lib/guest-session";
import {
  resolveGuestSubmissionAuth,
  type GuestSubmissionRepo,
} from "@/lib/guest-submission-auth";
import {
  FixedWindowRateLimiter,
  rateLimitIdentity,
  type RateLimitConfig,
} from "@/lib/rate-limit";
import type { UsageDelta } from "@/lib/usage";

/**
 * Shared guest-submission route pipeline (architecture deepening #1).
 *
 * All three guest-submission routes (photos §6.4, voice-notes §6.5,
 * guest-messages §6.6) run the same choreography — request-shape guard →
 * auth (via the pool client, before any body read, QA-2) → rate limit (after
 * auth, before body read, QA-3) → payload extraction → submission → 201 usage
 * response — differing only in the payload parser and the submit adapter.
 *
 * Wire behavior is identical to the pre-factory routes: same status codes,
 * same error code strings, same Set-Cookie clearing on invalid/expired
 * sessions, same Retry-After on 429, same 201 `{ submission, usage }` shape.
 */

export interface SubmissionError {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
}

/** Discriminated result of a payload extraction step. */
export type ExtractResult<T> =
  | { ok: true; payload: T }
  | { ok: false; status: number; code: string; message: string };

/** Discriminated result of a submit adapter. */
export type SubmissionResult<T = Record<string, unknown>> =
  | { ok: true; usage: UsageDelta; data: T }
  | { ok: false; kind: string; fields?: Record<string, string> };

export interface SubmitContext<T> {
  event: { id: string; status: string };
  session: GuestSession;
  payload: T;
}

export interface GuestSubmissionPipelineConfig<T> {
  /** Stable snake_case event name for the catch-all 500 log entry. */
  errorEventName: string;
  rateLimitConfig: RateLimitConfig;
  /** Message body for the 429 RATE_LIMITED response. */
  rateLimitedMessage: string;
  /** Cheap pre-auth request-shape guard (content-type). Null = pass. Never reads the body. */
  guard: (request: NextRequest) => SubmissionError | null;
  /** Body extraction after auth + rate limit. */
  extract: (request: NextRequest) => Promise<ExtractResult<T>>;
  /** Submission; receives the same pool client used for auth + the extracted payload. */
  submit: (context: SubmitContext<T>, client: PoolClient) => Promise<SubmissionResult>;
  /** Map a submit failure kind to its HTTP error (route-specific status/code). */
  mapSubmitError: (kind: string, fields?: Record<string, string>) => SubmissionError;
}

/** Build the auth repo over the same `pg` client used by the transaction. */
function repoFromClient(client: PoolClient): GuestSubmissionRepo {
  return {
    async findEventByPublicId(publicId) {
      const { rows } = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM events WHERE public_id = $1 LIMIT 1",
        [publicId],
      );
      return rows[0] ?? null;
    },
    async findSessionByTokenHash(hash) {
      const { rows } = await client.query<GuestSession>(
        "SELECT id, event_id, session_token, guest_name, expires_at FROM guest_sessions WHERE session_token = $1 LIMIT 1",
        [hash],
      );
      return rows[0] ?? null;
    },
  };
}

/** Client identity for rate limiting; forwarded headers only trusted behind a proxy. */
function rateLimitKey(request: NextRequest): string {
  return rateLimitIdentity(
    (name) => request.headers.get(name),
    process.env.TRUSTED_PROXY === "1",
  );
}

export function createGuestSubmissionHandler<T>(
  config: GuestSubmissionPipelineConfig<T>,
): (
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) => Promise<NextResponse> {
  const limiter = new FixedWindowRateLimiter(config.rateLimitConfig);

  return async (request, context) => {
    const { public_id } = await context.params;

    // Request-shape guard BEFORE auth: a wrong content-type wins over session
    // errors and never touches the DB or reads the body (API Contract §1).
    const guardError = config.guard(request);
    if (guardError) {
      return NextResponse.json(
        { error: { code: guardError.code, message: guardError.message } },
        { status: guardError.status },
      );
    }

    const pool = getPgPool();
    const client = await pool.connect();
    try {
      // Authorize before touching the body (QA-2): unknown event, CLOSED
      // status, and missing/invalid/wrong-event/expired cookies are rejected
      // without parsing.
      const auth = await resolveGuestSubmissionAuth(repoFromClient(client), {
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
      }

      // Rate limit immediately after authorization, before body parsing (QA-3).
      const rate = limiter.check(rateLimitKey(request));
      if (!rate.allowed) {
        return NextResponse.json(
          { error: { code: "RATE_LIMITED", message: config.rateLimitedMessage } },
          { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
      }

      // Extract payload (bounded body read; the adapter guards its own limits).
      const extracted = await config.extract(request);
      if (!extracted.ok) {
        return NextResponse.json(
          { error: { code: extracted.code, message: extracted.message } },
          { status: extracted.status },
        );
      }

      const result = await config.submit(
        { event: auth.event, session: auth.session, payload: extracted.payload },
        client,
      );
      if (!result.ok) {
        const mapped = config.mapSubmitError(result.kind, result.fields);
        const error = mapped.fields
          ? { code: mapped.code, message: mapped.message, fields: mapped.fields }
          : { code: mapped.code, message: mapped.message };
        return NextResponse.json({ error }, { status: mapped.status });
      }

      return NextResponse.json({ ...result.data, usage: result.usage }, { status: 201 });
    } catch (err) {
      logApiError({ event: config.errorEventName, request, code: "INTERNAL_ERROR", error: err });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  };
}
