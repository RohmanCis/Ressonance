import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";

import type { Database } from "@/types/supabase";

/**
 * Server-bound Supabase client (anon key, RLS-enforced).
 * Reads/writes the Supabase auth cookies from the current request.
 * For privileged operations requiring the service role, use a dedicated
 * service-role client instead; never expose SUPA=... to the browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll: ((cookiesToSet: Parameters<SetAllCookies>[0]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookie writes are
            // disallowed. Middleware/route handlers must refresh sessions.
          }
        }),
      },
    },
  );
}