import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { closeAdminEvent, findAdminEvent } from "@/lib/admin-event-repo";
import { logApiError } from "@/lib/api-log";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * POST /api/admin/events/{public_id}/close — Close event (API Contract 5.5).
 * Requires a valid admin session and event ownership. Closes an ACTIVE event
 * (status CLOSED + non-null closed_at); CLOSED → 409 EVENT_ALREADY_CLOSED;
 * ARCHIVED or other non-ACTIVE → 409 INVALID_EVENT_STATE.
 */
export async function POST(
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

    const result = await closeAdminEvent(db, public_id);
    if (result.kind === "already_closed") {
      return NextResponse.json(
        { error: { code: "EVENT_ALREADY_CLOSED", message: "This event is already closed." } },
        { status: 409 },
      );
    }
    if (result.kind === "invalid_event_state") {
      return NextResponse.json(
        { error: { code: "INVALID_EVENT_STATE", message: "This event cannot be closed in its current state." } },
        { status: 409 },
      );
    }
    if (result.kind === "error") {
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
        { status: 500 },
      );
    }

    return NextResponse.json({ event: result.event }, { status: 200 });
  } catch (err) {
    logApiError({ event: "admin_close_event_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}