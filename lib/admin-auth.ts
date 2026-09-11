import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { findAdminEvent, type AdminEventOwned } from "@/lib/admin-event-repo";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared admin route authentication (API Contract §§5.2–5.12).
 *
 * `requireAdmin` resolves the SSR Supabase session and returns the canonical
 * 401 AUTHENTICATION_REQUIRED envelope on failure; `requireOwnedEvent` applies
 * the findAdminEvent + admin_id ownership check and returns the canonical
 * 404 NOT_FOUND / 403 FORBIDDEN envelopes. Both reproduce the per-route
 * boilerplate they replace byte-for-byte (envelopes/status codes unchanged).
 */

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RequireAdminResult =
  | { ok: true; user: User; supabase: ServerSupabaseClient }
  | { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." } },
        { status: 401 },
      ),
    };
  }
  return { ok: true, user: data.user, supabase };
}

export type RequireOwnedEventResult =
  | { ok: true; event: AdminEventOwned }
  | { ok: false; response: NextResponse };

export async function requireOwnedEvent(
  db: SupabaseClient,
  publicId: string,
  adminId: string,
): Promise<RequireOwnedEventResult> {
  const event = await findAdminEvent(db, publicId);
  if (!event) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Event not found." } },
        { status: 404 },
      ),
    };
  }
  if (event.admin_id !== adminId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not authorized to access this event." } },
        { status: 403 },
      ),
    };
  }
  return { ok: true, event };
}
