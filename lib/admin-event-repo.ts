import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin event management (API Contract §§5.3–5.6, TECHNICAL_DESIGN §11).
 *
 * All access flows through the service-role client (bypasses RLS) because the
 * admin auth session is validated separately via the SSR client and ownership
 * is checked here against the authenticated admin id. No DB primary key,
 * token, storage, or unapproved field is ever returned.
 */

export interface AdminEventRecord {
  public_id: string;
  title: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface AdminEventOwned extends AdminEventRecord {
  admin_id: string;
}

/** Partial unique index on admin_id WHERE status='ACTIVE' (TECHNICAL_DESIGN §11). */
const ACTIVE_UNIQUE_CONSTRAINT = "uq_events_one_active_per_admin";

export type CreateEventResult =
  | { kind: "ok"; event: AdminEventRecord }
  | { kind: "active_event_exists" }
  | { kind: "error" };

export type CloseEventResult =
  | { kind: "ok"; event: AdminEventRecord }
  | { kind: "already_closed" }
  | { kind: "error" };

type Db = SupabaseClient;

/** Load an event by public_id including admin_id for ownership checks. */
export async function findAdminEvent(db: Db, publicId: string): Promise<AdminEventOwned | null> {
  const { data, error } = await db
    .from("events")
    .select("public_id, title, status, created_at, closed_at, admin_id")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw error;
  return (data as AdminEventOwned | null) ?? null;
}

/** Insert an ACTIVE event. Maps the one-active-per-admin constraint to a business error. */
export async function createAdminEvent(
  db: Db,
  opts: { adminId: string; title: string; publicId: string },
): Promise<CreateEventResult> {
  const { data, error } = await db
    .from("events")
    .insert({ public_id: opts.publicId, admin_id: opts.adminId, title: opts.title, status: "ACTIVE" })
    .select("public_id, title, status, created_at, closed_at")
    .single();
  if (error) {
    if (isConstraintViolation(error, ACTIVE_UNIQUE_CONSTRAINT)) return { kind: "active_event_exists" };
    return { kind: "error" };
  }
  return { kind: "ok", event: data as AdminEventRecord };
}

/** Close an ACTIVE event. Returns already_closed when it is not ACTIVE. */
export async function closeAdminEvent(db: Db, publicId: string): Promise<CloseEventResult> {
  const { data, error } = await db
    .from("events")
    .update({ status: "CLOSED", closed_at: new Date().toISOString() })
    .eq("public_id", publicId)
    .eq("status", "ACTIVE")
    .select("public_id, title, status, created_at, closed_at")
    .maybeSingle();
  if (error) return { kind: "error" };
  if (!data) return { kind: "already_closed" };
  return { kind: "ok", event: data as AdminEventRecord };
}

function isConstraintViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: string }).message ?? "";
  return message.includes(constraint);
}