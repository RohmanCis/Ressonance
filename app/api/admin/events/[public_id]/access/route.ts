import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { findAdminEvent } from "@/lib/admin-event-repo";
import { logApiError } from "@/lib/api-log";
import { getServerConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Same-origin public URL for an event (API Contract 5.6). */
function publicUrl(publicId: string): string {
  return `${getServerConfig().appUrl}/e/${publicId}`;
}

/**
 * GET /api/admin/events/{public_id}/access — Event QR/public URL (API Contract 5.6).
 * Requires a valid admin session and event ownership. Returns the public URL
 * used to render/share the QR; no QR entity or storage data is created/returned.
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
      { public_id: event.public_id, public_url: publicUrl(event.public_id) },
      { status: 200 },
    );
  } catch (err) {
    logApiError({ event: "admin_access_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}