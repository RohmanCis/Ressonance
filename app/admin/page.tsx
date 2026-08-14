import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminEventIndex } from "@/components/admin/admin-event-index";

// UI_UX §5.5: unauthenticated /admin redirects to sign-in.
// Presence gate only: without a Supabase auth cookie no session is possible,
// so redirect server-side. With a cookie, render the index — the API remains
// authoritative and the client redirects on 401 (expired/invalid session).
export default async function AdminIndexPage() {
  const store = await cookies();
  const hasAuthCookie = store.getAll().some((cookie) => /^sb-.*-auth-token/.test(cookie.name));
  if (!hasAuthCookie) redirect("/admin/sign-in");
  return <AdminEventIndex />;
}
