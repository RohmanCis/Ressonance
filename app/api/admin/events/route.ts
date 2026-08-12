import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminEvent } from "@/lib/admin-event-repo";
import { getServerConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Opaque, non-sequential public id (API Contract §4/§5.3; format remains open). */
function generatePublicId(): string {
  return randomBytes(16).toString("base64url");
}

/** Same-origin public URL for an event (API Contract 5.3/5.6). */
function publicUrl(publicId: string): string {
  return `${getServerConfig().appUrl}/e/${publicId}`;
}

function readTitle(body: unknown): { ok: true; title: string } | { ok: false } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const title = (body as Record<string, unknown>).title;
  if (typeof title !== "string" || title.trim().length === 0) return { ok: false };
  return { ok: true, title: title.trim() };
}

/**
 * POST /api/admin/events — Create event (API Contract 5.3).
 * Requires a valid admin session, validates `title`, creates an ACTIVE event
 * with an opaque public id, and returns the event plus its public URL. The
 * one-active-per-admin partial unique index is authoritative; a constraint
 * violation maps to 409 ACTIVE_EVENT_EXISTS.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) {
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." } },
      { status: 401 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Content-Type must be application/json." } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Malformed JSON request body." } },
      { status: 400 },
    );
  }

  const title = readTitle(body);
  if (!title.ok) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Request validation failed.",
          fields: { title: "Title is required." },
        },
      },
      { status: 400 },
    );
  }

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const result = await createAdminEvent(db, {
      adminId: auth.user.id,
      title: title.title,
      publicId: generatePublicId(),
    });

    if (result.kind === "active_event_exists") {
      return NextResponse.json(
        { error: { code: "ACTIVE_EVENT_EXISTS", message: "An active event already exists." } },
        { status: 409 },
      );
    }
    if (result.kind === "error") {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { event: result.event, public_url: publicUrl(result.event.public_id) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}