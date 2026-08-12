import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhotoMimeType } from "@/lib/photo-file";

/**
 * Private Supabase Storage adapter for photo objects (T006).
 *
 * Backend-mediated only; guests never receive storage keys or URLs
 * (API Contract §7). `delete` is used as compensation when a newly written
 * object must be removed after a metadata failure.
 */
export interface PhotoStorage {
  upload(key: string, data: Uint8Array, mime: PhotoMimeType): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createPhotoStorage(
  client: SupabaseClient,
  bucket: string,
): PhotoStorage {
  return {
    async upload(key, data, mime) {
      const { error } = await client.storage
        .from(bucket)
        .upload(key, data, { contentType: mime });
      if (error) throw error;
    },
    async delete(key) {
      const { error } = await client.storage.from(bucket).remove([key]);
      if (error) throw error;
    },
  };
}