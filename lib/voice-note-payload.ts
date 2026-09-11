import { loadVoiceNoteFileConfig } from "@/lib/audio-file";
import {
  createMultipartPayloadExtractor,
  guardMultipartPayload,
} from "@/lib/multipart-payload";

/**
 * Voice-note submission payload extraction (API Contract §6.5).
 *
 * Pre-auth content-type guard (`guardVoiceNotePayload`, never reads the body)
 * and post-auth bounded body read + `voice_note` field extraction
 * (`extractVoiceNotePayload`). ffprobe format/duration inspection stays in
 * `submitVoiceNote` (the authoritative check, ADR-006) — this adapter only
 * moves the bounded read that previously lived in the route.
 */

/** Pre-auth content-type guard. Null = pass. */
export const guardVoiceNotePayload = guardMultipartPayload;

/** Read the bounded body and extract the single `voice_note` field. */
export const extractVoiceNotePayload = createMultipartPayloadExtractor({
  fieldName: "voice_note",
  loadMaxSizeBytes: () => loadVoiceNoteFileConfig().maxSizeBytes,
  sizeMessage: "The audio exceeds the size limit.",
});
