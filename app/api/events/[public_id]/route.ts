import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * GET /api/events/{public_id} — Get event by public ID (API Contract 6.1).
 * No authentication. The guest cookie is ignored for event discovery — this
 * route never reads or sets cookies. ACTIVE and CLOSED events are returned so
 * guests can view the page; any other status (or an unknown event) is 404.
 * Returns exactly { public_id, title, status } so the DB PK never leaks.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ public_id: string }> },
) {
  const { public_id } = await context.params;

  // types/supabase.ts is a placeholder until migrations generate types.
  const db = createServiceRoleClient() as unknown as SupabaseClient;

  try {
    const { data, error } = await db
      .from("events")
      .select("public_id, title, status")
      .eq("public_id", public_id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Event not found." } },
        { status: 404 },
      );
    }

    const status = data.status as string;
    if (status !== "ACTIVE" && status !== "CLOSED") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Event not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        event: {
          public_id: data.public_id as string,
          title: data.title as string,
          status,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}