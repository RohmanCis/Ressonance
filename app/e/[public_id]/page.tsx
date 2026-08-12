import { GuestEventEntry } from "@/components/guest-event-entry";

export default async function EventPage({
  params,
}: {
  params: Promise<{ public_id: string }>;
}) {
  const { public_id } = await params;
  return <GuestEventEntry publicId={public_id} />;
}
