import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/me — Current admin/session (API Contract 5.2).
 * Requires a valid Supabase Auth session. Missing, expired, or invalid
 * sessions return 401. Success returns the exact `{ admin: { email } }` shape.
 */

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json({ admin: { email: auth.user.email } }, { status: 200 });
}
