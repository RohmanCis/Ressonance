import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  buildGuestSessionCookie,
  clearGuestSessionCookie,
  GUEST_SESSION_COOKIE,
} from "@/lib/guest-session";
import { getSessionUsage, type UsageRepo } from "@/lib/get-session-usage";
import {
  FixedWindowRateLimiter,
  loadRateLimitConfig,
  rateLimitIdentity,
} from "@/lib/rate-limit";
import { startGuestSession, type SessionRepo } from "@/lib/start-guest-session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// Session-creation rate limit (API Contract §3 Rate limits / ADR-008).
const sessionRateLimiter = new FixedWindowRateLimiter(loadRateLimitConfig());

/**
 * POST /api/events/{public_id}/session — Start GuestSession (API Contract 6.2).
 * Server-side only. Resolves the opaque event, rejects CLOSED/unknown events,
 * validates the optional name, stores a SHA-256 digest (never the raw token),
 * and sets the __Host-guest_session HttpOnly cookie via the T003 helper.
 */

function readGuestName(body: unknown): { ok: false } | { ok: true; value: unknown } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  return { ok: true, value: (body as Record<string, unknown>).guest_name };
}

/** Client identity for rate limiting. Trusts forwarded headers ONLY behind an
 * explicitly configured trusted reverse proxy; otherwise all requests share one
 * coarse bucket so a spoofed header can never bypass the limit. */
function rateLimitKey(request: NextRequest): string {
  return rateLimitIdentity(
    (name) => request.headers.get(name),
    process.env.TRUSTED_PROXY === "1",
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  // JSON request expectation (API Contract §1: JSON requests use
  // Content-Type: application/json). Missing/wrong content type => 400.
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Content-Type must be application/json." } },
      { status: 400 },
    );
  }

  // Endpoint-level rate limit before any persistence work.
  const rate = sessionRateLimiter.check(rateLimitKey(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many session requests. Try again shortly." } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Malformed request body." } },
      { status: 400 },
    );
  }

  let body: unknown;
  if (raw.trim().length === 0) {
    body = {};
  } else {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Malformed JSON request body." } },
        { status: 400 },
      );
    }
  }

  const guestName = readGuestName(body);
  if (!guestName.ok) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Malformed request body." } },
      { status: 400 },
    );
  }

  // types/supabase.ts is a placeholder until migrations generate types; use an
  // untyped SupabaseClient for these raw queries (typed cast, no explicit any).
  const db = createServiceRoleClient() as unknown as SupabaseClient;

  const repo: SessionRepo = {
    async findEventByPublicId(pid) {
      const { data, error } = await db
        .from("events")
        .select("id, status")
        .eq("public_id", pid)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, status: data.status as string } : null;
    },
    async createGuestSession(input) {
      const { data, error } = await db
        .from("guest_sessions")
        .insert({
          event_id: input.eventId,
          session_token: input.sessionTokenHash,
          guest_name: input.guestName,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },
  };

  try {
    const result = await startGuestSession(repo, {
      publicId: public_id,
      guestName: guestName.value,
    });

    switch (result.kind) {
      case "invalid_guest_name":
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
      case "ok": {
        const response = NextResponse.json({ session: result.body }, { status: 201 });
        response.headers.append("Set-Cookie", buildGuestSessionCookie(result.token));
        return response;
      }
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

/**
 * GET /api/events/{public_id}/session — Get session/usage state (API Contract 6.3).
 * Read-only. Requires a valid guest-session cookie belonging to `{public_id}`.
 * Returns 404 for unknown events; CLOSED events stay readable (status included).
 * Invalid/unknown/mismatched/expired sessions return 401 SESSION_INVALID /
 * SESSION_EXPIRED and clear the cookie. No rate limiting (creation-only).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  // types/supabase.ts is a placeholder until migrations generate types.
  const db = createServiceRoleClient() as unknown as SupabaseClient;

  const repo: UsageRepo = {
    async findEventByPublicId(pid) {
      const { data, error } = await db
        .from("events")
        .select("id, public_id, title, status")
        .eq("public_id", pid)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id as string,
            public_id: data.public_id as string,
            title: data.title as string,
            status: data.status as string,
          }
        : null;
    },
    async findSessionByTokenHash(hash) {
      const { data, error } = await db
        .from("guest_sessions")
        .select("id, event_id, session_token, guest_name, expires_at")
        .eq("session_token", hash)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id as string,
            event_id: data.event_id as string,
            session_token: data.session_token as string,
            guest_name: data.guest_name as string | null,
            expires_at: data.expires_at as string,
          }
        : null;
    },
    async countPhotos(sessionId) {
      const { count, error } = await db
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", sessionId);
      if (error) throw error;
      return (count ?? 0) as number;
    },
    async countVoiceNotes(sessionId) {
      const { count, error } = await db
        .from("voice_notes")
        .select("id", { count: "exact", head: true })
        .eq("guest_session_id", sessionId);
      if (error) throw error;
      return (count ?? 0) as number;
    },
  };

  const cookieValue = request.cookies.get(GUEST_SESSION_COOKIE)?.value;

  try {
    const result = await getSessionUsage(repo, {
      publicId: public_id,
      cookieValue,
    });

    switch (result.kind) {
      case "not_found":
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Event not found." } },
          { status: 404 },
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
      case "ok":
        return NextResponse.json(result.body, { status: 200 });
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}