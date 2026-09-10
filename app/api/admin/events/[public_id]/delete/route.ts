import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { deleteAdminEvent } from "@/lib/admin-delete-event";
import { findAdminEvent } from "@/lib/admin-event-repo";
import { logApiError } from "@/lib/api-log";
import { getServerConfig } from "@/lib/config";
import { createSupabaseCleanupStorage } from "@/lib/media-cleanup";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/events/{public_id}/delete — Hard delete a CLOSED event
 * (API Contract 5.12). Requires a valid admin session and event ownership.
 * ACTIVE events return 403 FORBIDDEN; only CLOSED events are deletable.
 * Deletes storage objects, then photos/voice_notes/guest_sessions metadata,
 * then the event record.
 */
export async function DELETE(
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
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not authorized to access this event." } },
        { status: 403 },
      );
    }

    const storage = createSupabaseCleanupStorage(db, getServerConfig().supabaseStorageBucket);
    const result = await deleteAdminEvent(db, storage, public_id);

    switch (result.kind) {
      case "not_found":
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Event not found." } }, { status: 404 });
      case "active_event":
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Active event cannot be deleted. Close it first." } },
          { status: 403 },
        );
      case "error":
        return NextResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
          { status: 500 },
        );
      case "ok":
        return NextResponse.json({ deleted: true }, { status: 200 });
    }
  } catch (err) {
    logApiError({ event: "admin_delete_event_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}
