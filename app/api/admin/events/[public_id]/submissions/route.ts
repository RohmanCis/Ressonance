import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  findEventByPublicId,
  listSubmissions,
} from "@/lib/admin-media-repo";
import { logApiError } from "@/lib/api-log";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const GUEST_NAME_MAX_LENGTH = 200;

/**
 * GET /api/admin/events/{public_id}/submissions — List/search submissions
 * (API Contract 5.7). Requires a valid admin session and event ownership.
 * Optional `guest_name` query filters to that session name. Returns unified
 * photo/voice metadata, newest first, with no storage key or URL.
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

  const rawGuestName = request.nextUrl.searchParams.get("guest_name");
  let guestName: string | undefined;
  if (rawGuestName !== null) {
    const trimmed = rawGuestName.trim();
    if (trimmed.length > GUEST_NAME_MAX_LENGTH) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Request validation failed.",
            fields: { guest_name: "guest_name is too long." },
          },
        },
        { status: 400 },
      );
    }
    guestName = trimmed === "" ? undefined : trimmed;
  }

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const event = await findEventByPublicId(db, public_id);
    if (!event) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Event not found." } }, { status: 404 });
    }
    if (event.admin_id !== auth.user.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not authorized to access this event." } }, { status: 403 });
    }

    const submissions = await listSubmissions(db, event.id, guestName);
    return NextResponse.json({ submissions }, { status: 200 });
  } catch (err) {
    logApiError({ event: "admin_submissions_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}