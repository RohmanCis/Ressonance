import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VoiceNoteMimeType } from "@/lib/audio-file";
import { createStorageAdapter, type StorageAdapter } from "@/lib/storage-adapter";

/**
 * Private Supabase Storage adapter for voice-note objects (T007).
 *
 * Backend-mediated only; guests never receive storage keys or URLs
 * (API Contract §7). `delete` is used as compensation when a newly written
 * object must be removed after a metadata failure.
 */
export type VoiceNoteStorage = StorageAdapter<VoiceNoteMimeType>;

export function createVoiceNoteStorage(
  client: SupabaseClient,
  bucket: string,
): VoiceNoteStorage {
  return createStorageAdapter<VoiceNoteMimeType>(client, bucket);
}
