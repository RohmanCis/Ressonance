import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/me — Current admin/session (API Contract 5.2).
 * Requires a valid Supabase Auth session. Missing, expired, or invalid
 * sessions return 401. Success returns the exact `{ admin: { email } }` shape.
 */

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." } },
      { status: 401 },
    );
  }

  return NextResponse.json({ admin: { email: data.user.email } }, { status: 200 });
}