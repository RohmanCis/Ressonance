/**
 * Server-side configuration loader.
 *
 * Validates required Supabase environment variables at startup and exposes
 * typed configuration. Importing this module from a client component leaks
 * server-only values; keep it on the server boundary.
 */
export function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!appUrl) missing.push("NEXT_PUBLIC_APP_URL");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and fill in the values.",
    );
  }

  return {
    supabaseUrl: url as string,
    supabaseAnonKey: anonKey as string,
    supabaseServiceRoleKey: serviceRoleKey as string,
    appUrl: appUrl as string,
  };
}