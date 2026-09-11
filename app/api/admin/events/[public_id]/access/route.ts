import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin, requireOwnedEvent } from "@/lib/admin-auth";
import { logApiError } from "@/lib/api-log";
import { eventPublicUrl } from "@/lib/events-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

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

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const owned = await requireOwnedEvent(db, public_id, auth.user.id);
    if (!owned.ok) return owned.response;
    const event = owned.event;

    return NextResponse.json(
      { public_id: event.public_id, public_url: eventPublicUrl(event.public_id) },
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
