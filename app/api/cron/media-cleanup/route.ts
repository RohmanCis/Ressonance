import { NextRequest, NextResponse } from "next/server";

import { logApiError } from "@/lib/api-log";
import { getServerConfig } from "@/lib/config";
import {
  createSupabaseCleanupDb,
  createSupabaseCleanupStorage,
  runMediaCleanup,
} from "@/lib/media-cleanup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * GET /api/cron/media-cleanup — internal operational endpoint (API Contract
 * §7.1). Invoked daily by Vercel Cron. Authorized only by the shared
 * `CRON_SECRET` bearer token; unconfigured secret fails closed. Enforces the
 * approved retention policy: delete private Storage objects for CLOSED events
 * older than 7 days, then their metadata. Idempotent; partial failure returns
 * 500 so the next scheduled run retries.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logApiError({
      event: "cron_cleanup_unconfigured",
      request,
      code: "INTERNAL_ERROR",
      error: new Error("CRON_SECRET is not configured"),
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid cron secret is required." } },
      { status: 401 },
    );
  }

  try {
    const config = getServerConfig();
    const client = createServiceRoleClient();
    const result = await runMediaCleanup(
      createSupabaseCleanupDb(client),
      createSupabaseCleanupStorage(client, config.supabaseStorageBucket),
    );

    if (result.failures.length > 0) {
      // Partial success is never reported as full success; daily retry recovers.
      logApiError({
        event: "media_cleanup_partial_failure",
        request,
        code: "INTERNAL_ERROR",
        error: new Error(`${result.failures.length} cleanup failure(s)`),
        context: {
          eventsScanned: result.eventsScanned,
          objectsDeleted: result.objectsDeleted,
          failures: result.failures,
        },
      });
      return NextResponse.json(
        {
          error: { code: "INTERNAL_ERROR", message: "Internal server error." },
          cleanup: {
            eventsScanned: result.eventsScanned,
            objectsDeleted: result.objectsDeleted,
            photosMetadataDeleted: result.photosMetadataDeleted,
            voiceNotesMetadataDeleted: result.voiceNotesMetadataDeleted,
            failures: result.failures.length,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        cleanup: {
          eventsScanned: result.eventsScanned,
          objectsDeleted: result.objectsDeleted,
          photosMetadataDeleted: result.photosMetadataDeleted,
          voiceNotesMetadataDeleted: result.voiceNotesMetadataDeleted,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    logApiError({ event: "media_cleanup_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}
