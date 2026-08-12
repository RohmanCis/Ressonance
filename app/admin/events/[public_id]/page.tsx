import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminDashboardPage({ params }: { params: Promise<{ public_id: string }> }) {
  return <AdminDashboard publicId={(await params).public_id} />;
}
