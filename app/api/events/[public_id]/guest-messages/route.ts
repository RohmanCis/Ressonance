import {
  createGuestSubmissionHandler,
  type SubmissionError,
} from "@/lib/guest-submission-pipeline";
import { createGuestMessageTxRepo } from "@/lib/guest-message-tx-repo";
import {
  extractGuestMessagePayload,
  guardGuestMessagePayload,
} from "@/lib/guest-message-payload";
import { submitGuestMessage } from "@/lib/submit-guest-message";
import { loadGuestMessageRateLimitConfig } from "@/lib/rate-limit";

export const runtime = "nodejs";

const messageErrorMap: Record<string, SubmissionError> = {
  invalid_input: { status: 422, code: "INVALID_INPUT", message: "Request validation failed." },
  event_closed: { status: 422, code: "EVENT_CLOSED", message: "This event is closed." },
  guest_message_limit_reached: {
    status: 409,
    code: "GUEST_MESSAGE_LIMIT_REACHED",
    message: "Message already submitted for this guest session.",
  },
  persistence_failed: {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Could not persist the message.",
  },
};

/**
 * POST /api/events/{public_id}/guest-messages — Submit guest message
 * (API Contract 6.6, Opsi B). Server-side only. Pipeline order: content-type →
 * authorize event + guest session → rate limit → bounded JSON body read →
 * validate `message_text` → insert transaction.
 * Unauthenticated/unknown/wrong-event and rate-limited requests never read
 * the body. The body is read incrementally with a hard 4 KB cap so oversized
 * requests are not fully buffered.
 */
export const POST = createGuestSubmissionHandler({
  errorEventName: "guest_message_submit_failed",
  rateLimitConfig: loadGuestMessageRateLimitConfig(),
  rateLimitedMessage: "Too many guest-message requests. Try again shortly.",
  guard: guardGuestMessagePayload,
  extract: extractGuestMessagePayload,
  submit: async ({ event, session, payload }, client) => {
    const result = await submitGuestMessage(
      { txRepo: createGuestMessageTxRepo(client) },
      { event, session, messageText: payload.messageText },
    );
    if (result.kind === "ok") {
      return { ok: true, usage: result.usage, data: { submission: result.submission } };
    }
    return {
      ok: false,
      kind: result.kind,
      fields: result.kind === "invalid_input" ? result.fields : undefined,
    };
  },
  mapSubmitError: (kind, fields) => {
    const mapped = messageErrorMap[kind];
    if (kind === "invalid_input" && fields) {
      return { ...mapped, fields };
    }
    return mapped ?? { status: 500, code: "INTERNAL_ERROR", message: "Internal server error." };
  },
});
