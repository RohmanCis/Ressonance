import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VoiceNoteMimeType } from "@/lib/audio-file";

/**
 * Private Supabase Storage adapter for voice-note objects (T007).
 *
 * Backend-mediated only; guests never receive storage keys or URLs
 * (API Contract §7). `delete` is used as compensation when a newly written
 * object must be removed after a metadata failure.
 */
export interface VoiceNoteStorage {
  upload(key: string, data: Uint8Array, mime: VoiceNoteMimeType): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createVoiceNoteStorage(
  client: SupabaseClient,
  bucket: string,
): VoiceNoteStorage {
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