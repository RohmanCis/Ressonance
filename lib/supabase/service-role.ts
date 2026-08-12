import "server-only";

import { createClient as createSupabaseServerClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * Server-only client authenticated with the service-role key.
 *
 * Security: this client bypasses RLS and must NEVER cross the server
 * boundary. The `server-only` import forces a build-time error if this module
 * is ever imported from a Client Component. Keep it server-exclusive.
 */
export function createServiceRoleClient() {
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}