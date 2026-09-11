import {
  createMultipartPayloadExtractor,
  guardMultipartPayload,
} from "@/lib/multipart-payload";
import { loadPhotoFileConfig } from "@/lib/photo-file";

/**
 * Photo submission payload extraction (API Contract §6.4).
 *
 * Pre-auth content-type guard (`guardPhotoPayload`, never reads the body) and
 * post-auth bounded body read + `photo` field extraction
 * (`extractPhotoPayload`). Byte-level limits mirror the route: the total
 * buffered body is capped at the file-size limit + multipart overhead; the
 * authoritative file-size check happens later in `validatePhotoFile`
 * (lib/photo-file.ts).
 */

/** Pre-auth content-type guard. Null = pass. */
export const guardPhotoPayload = guardMultipartPayload;

/**
 * Read the bounded body and extract the single `photo` field.
 * Never trusts the client MIME header — only bytes are extracted here;
 * format approval happens in `validatePhotoFile`.
 */
export const extractPhotoPayload = createMultipartPayloadExtractor({
  fieldName: "photo",
  loadMaxSizeBytes: () => loadPhotoFileConfig().maxSizeBytes,
  sizeMessage: "The image exceeds the size limit.",
});
