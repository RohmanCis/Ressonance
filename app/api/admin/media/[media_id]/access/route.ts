import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedMedia } from "@/lib/admin-media-repo";
import { getServerConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * GET /api/admin/media/{media_id}/access — Get media access URL
 * (API Contract 5.8). Requires a valid admin session and event ownership.
 * Returns a short-lived signed URL + expires_at; never a storage key or
 * public URL.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ media_id: string }> },
) {
  const { media_id } = await context.params;

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
        return NextResponse.json(
          { url: result.url, expires_at: result.expires_at },
          { status: 200 },
        );
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}