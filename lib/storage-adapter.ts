import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Private Supabase Storage adapter factory (T006/T007).
 *
 * Backend-mediated only; guests never receive storage keys or URLs
 * (API Contract §7). `delete` is used as compensation when a newly written
 * object must be removed after a metadata failure.
 */
export interface StorageAdapter<Mime extends string> {
  upload(key: string, data: Uint8Array, mime: Mime): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createStorageAdapter<Mime extends string>(
  client: SupabaseClient,
  bucket: string,
): StorageAdapter<Mime> {
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
