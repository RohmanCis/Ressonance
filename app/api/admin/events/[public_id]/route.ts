import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { findAdminEvent } from "@/lib/admin-event-repo";
import { logApiError } from "@/lib/api-log";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * GET /api/admin/events/{public_id} — Get event (API Contract 5.4).
 * Requires a valid admin session and event ownership. Returns the exact Event
 * shape; the DB PK never leaks.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) {
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." } },
      { status: 401 },
    );
  }

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const event = await findAdminEvent(db, public_id);
    if (!event) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Event not found." } }, { status: 404 });
    }
    if (event.admin_id !== auth.user.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not authorized to access this event." } }, { status: 403 });
    }

    return NextResponse.json(
      {
        event: {
          public_id: event.public_id,
          title: event.title,
          status: event.status,
          created_at: event.created_at,
          closed_at: event.closed_at,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    logApiError({ event: "admin_event_detail_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}