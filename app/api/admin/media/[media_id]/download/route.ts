import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { resolveAuthorizedMedia } from "@/lib/admin-media-repo";
import { logApiError } from "@/lib/api-log";
import { getServerConfig } from "@/lib/config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * GET /api/admin/media/{media_id}/download — Download individual media
 * (API Contract 5.9). Repeats the media ownership check, generates a fresh
 * short-lived signed URL, and returns `302 Found` redirecting to it. Never
 * returns the signed URL as JSON and never proxies the media.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ media_id: string }> },
) {
  const { media_id } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const db = createServiceRoleClient() as unknown as SupabaseClient;
  try {
    const result = await resolveAuthorizedMedia(
      db,
      getServerConfig().supabaseStorageBucket,
      media_id,
      auth.user.id,
    );

    switch (result.kind) {
      case "not_found":
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Media not found." } }, { status: 404 });
      case "forbidden":
        return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not authorized to access this media." } }, { status: 403 });
      case "access_failed":
        return NextResponse.json(
          { error: { code: "MEDIA_ACCESS_FAILED", message: "Could not generate media access URL." } },
          { status: 502 },
        );
      case "ok":
        return NextResponse.redirect(result.url, { status: 302 });
    }
  } catch (err) {
    logApiError({ event: "admin_media_download_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}
