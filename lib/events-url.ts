import { getServerConfig } from "@/lib/config";

/** Same-origin public URL for an event (API Contract 5.3/5.6). */
export function eventPublicUrl(publicId: string): string {
  return `${getServerConfig().appUrl}/e/${publicId}`;
}
