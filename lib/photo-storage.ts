import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhotoMimeType } from "@/lib/photo-file";
import { createStorageAdapter, type StorageAdapter } from "@/lib/storage-adapter";

/**
 * Private Supabase Storage adapter for photo objects (T006).
 *
 * Backend-mediated only; guests never receive storage keys or URLs
 * (API Contract §7). `delete` is used as compensation when a newly written
 * object must be removed after a metadata failure.
 */
export type PhotoStorage = StorageAdapter<PhotoMimeType>;

export function createPhotoStorage(
  client: SupabaseClient,
  bucket: string,
): PhotoStorage {
  return createStorageAdapter<PhotoMimeType>(client, bucket);
}
