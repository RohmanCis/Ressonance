import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin, requireOwnedEvent } from "@/lib/admin-auth";
import { logApiError } from "@/lib/api-log";
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

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const owned = await requireOwnedEvent(db, public_id, auth.user.id);
    if (!owned.ok) return owned.response;
    const event = owned.event;

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
