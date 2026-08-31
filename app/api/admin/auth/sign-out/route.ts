import { NextRequest, NextResponse } from "next/server";

import { logApiError } from "@/lib/api-log";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/sign-out — Admin sign-out (API Contract 5.11).
 * Invalidates the current Supabase Auth session. The SSR cookie adapter
 * (lib/supabase/server.ts setAll) clears auth cookies — no manual cookie
 * surgery, no `__Host-admin_session` (it does not exist). Missing, expired,
 * or invalid sessions return 401. Success returns `{ signed_out: true }`.
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json(
        { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." } },
        { status: 401 },
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({ signed_out: true }, { status: 200 });
  } catch (err) {
    logApiError({ event: "admin_sign_out_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}
