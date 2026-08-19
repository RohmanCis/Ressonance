import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerConfig } from "@/lib/config";
import {
  createGuestSubmissionHandler,
  type SubmissionError,
} from "@/lib/guest-submission-pipeline";
import { loadPhotoFileConfig } from "@/lib/photo-file";
import { extractPhotoPayload, guardPhotoPayload } from "@/lib/photo-payload";
import { createPhotoStorage } from "@/lib/photo-storage";
import { createPhotoTxRepo } from "@/lib/photo-tx-repo";
import { loadPhotoRateLimitConfig } from "@/lib/rate-limit";
import { submitPhoto, type SubmitPhotoResult } from "@/lib/submit-photo";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const photoErrorMap: Record<Exclude<SubmitPhotoResult["kind"], "ok">, SubmissionError> = {
  invalid_request: { status: 400, code: "INVALID_REQUEST", message: "Request validation failed." },
  event_closed: { status: 422, code: "EVENT_CLOSED", message: "This event is closed." },
  unsupported_media: { status: 422, code: "UNSUPPORTED_MEDIA", message: "Unsupported image format." },
  file_too_large: { status: 422, code: "FILE_TOO_LARGE", message: "The image exceeds the size limit." },
  photo_limit_reached: {
    status: 409,
    code: "PHOTO_LIMIT_REACHED",
    message: "Photo limit reached for this guest session.",
  },
  media_persistence_failed: {
    status: 502,
    code: "MEDIA_PERSISTENCE_FAILED",
    message: "Could not persist the photo.",
  },
};

/**
 * POST /api/events/{public_id}/photos — Submit photo (API Contract 6.4).
 * Server-side only. Pipeline order: content-type → authorize event + guest
 * session → rate limit → bounded body read → extract `photo` → upload
 * transaction. Unauthenticated/unknown/wrong-event and rate-limited requests
 * never read the body. The body is read incrementally with a hard cap
 * (`maxSizeBytes + overhead`) so oversized requests are not fully buffered.
 */
export const POST = createGuestSubmissionHandler({
  errorEventName: "photo_submit_failed",
  rateLimitConfig: loadPhotoRateLimitConfig(),
  rateLimitedMessage: "Too many photo requests. Try again shortly.",
  guard: guardPhotoPayload,
  extract: extractPhotoPayload,
  submit: async ({ event, session, payload }, client) => {
    const config = getServerConfig();
    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const result = await submitPhoto(
      {
        txRepo: createPhotoTxRepo(client),
        storage: createPhotoStorage(db, config.supabaseStorageBucket),
        config: loadPhotoFileConfig(),
      },
      { event, session, data: payload },
    );
    if (result.kind === "ok") {
      return { ok: true, usage: result.usage, data: { submission: result.submission } };
    }
    return { ok: false, kind: result.kind };
  },
  mapSubmitError: (kind) =>
    photoErrorMap[kind as keyof typeof photoErrorMap] ?? {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
    },
});
