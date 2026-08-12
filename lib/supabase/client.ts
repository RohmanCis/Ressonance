import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";

/**
 * Browser-bound Supabase client (anon key, RLS-enforced).
 * Create one per request/component; do not cache across mutating sessions.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}