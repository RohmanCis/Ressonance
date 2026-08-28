import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin/admin-dashboard";

// UI_UX §5.5: unauthenticated /admin/events/[public_id] redirects to sign-in.
// Presence gate only: without a Supabase auth cookie no session is possible,
// so redirect server-side. With a cookie, render the dashboard — the API
// remains authoritative and the client redirects on 401 (expired/invalid session).
export default async function AdminDashboardPage({ params }: { params: Promise<{ public_id: string }> }) {
  const store = await cookies();
  const hasAuthCookie = store.getAll().some((cookie) => /^sb-.*-auth-token/.test(cookie.name));
  if (!hasAuthCookie) redirect("/admin/sign-in");
  return <AdminDashboard publicId={(await params).public_id} />;
}
