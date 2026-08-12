import { AdminAccess } from "@/components/admin/admin-access";

export default async function AdminAccessPage({ params }: { params: Promise<{ public_id: string }> }) {
  return <AdminAccess publicId={(await params).public_id} />;
}
