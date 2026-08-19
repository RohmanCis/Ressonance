import type { SupabaseClient } from "@supabase/supabase-js";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import { loadVoiceNoteFileConfig } from "@/lib/audio-file";
import { createFfprobeAudioInspector } from "@/lib/audio-inspector";
import { getServerConfig } from "@/lib/config";
import {
  createGuestSubmissionHandler,
  type SubmissionError,
} from "@/lib/guest-submission-pipeline";
import { submitVoiceNote, type SubmitVoiceNoteResult } from "@/lib/submit-voice-note";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadVoiceNoteRateLimitConfig } from "@/lib/rate-limit";
import { createVoiceNoteStorage } from "@/lib/voice-note-storage";
import { createVoiceNoteTxRepo } from "@/lib/voice-note-tx-repo";
import {
  extractVoiceNotePayload,
  guardVoiceNotePayload,
} from "@/lib/voice-note-payload";

export const runtime = "nodejs";

const voiceErrorMap: Record<Exclude<SubmitVoiceNoteResult["kind"], "ok">, SubmissionError> = {
  invalid_request: { status: 400, code: "INVALID_REQUEST", message: "Request validation failed." },
  event_closed: { status: 422, code: "EVENT_CLOSED", message: "This event is closed." },
  unsupported_media: { status: 422, code: "UNSUPPORTED_MEDIA", message: "Unsupported audio format." },
  file_too_large: { status: 422, code: "FILE_TOO_LARGE", message: "The audio exceeds the size limit." },
  audio_duration_invalid: {
    status: 422,
    code: "AUDIO_DURATION_INVALID",
    message: "Voice note must be between 5 and 30 seconds.",
  },
  audio_uninspectable: {
    status: 422,
    code: "AUDIO_UNINSPECTABLE",
    message: "Could not inspect the audio file.",
  },
  voice_note_limit_reached: {
    status: 409,
    code: "VOICE_NOTE_LIMIT_REACHED",
    message: "Voice note already submitted for this guest session.",
  },
  media_persistence_failed: {
    status: 502,
    code: "MEDIA_PERSISTENCE_FAILED",
    message: "Could not persist the voice note.",
  },
};

/**
 * POST /api/events/{public_id}/voice-notes — Submit voice note (API Contract 6.5).
 * Server-side only. Pipeline order: content-type → authorize event + guest
 * session → rate limit → bounded body read → extract `voice_note` → ffprobe
 * inspection (format + duration) → upload transaction.
 * Unauthenticated/unknown/wrong-event and rate-limited requests never read the
 * body. The body is read incrementally with a hard cap
 * (`maxSizeBytes + overhead`) so oversized requests are not fully buffered.
 */
export const POST = createGuestSubmissionHandler({
  errorEventName: "voice_note_submit_failed",
  rateLimitConfig: loadVoiceNoteRateLimitConfig(),
  rateLimitedMessage: "Too many voice-note requests. Try again shortly.",
  guard: guardVoiceNotePayload,
  extract: extractVoiceNotePayload,
  submit: async ({ event, session, payload }, client) => {
    const config = getServerConfig();
    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const result = await submitVoiceNote(
      {
        txRepo: createVoiceNoteTxRepo(client),
        storage: createVoiceNoteStorage(db, config.supabaseStorageBucket),
        inspector: createFfprobeAudioInspector(
          process.env.FFPROBE_PATH ?? ffprobeInstaller.path,
        ),
        config: loadVoiceNoteFileConfig(),
      },
      { event, session, data: payload },
    );
    if (result.kind === "ok") {
      return { ok: true, usage: result.usage, data: { submission: result.submission } };
    }
    return { ok: false, kind: result.kind };
  },
  mapSubmitError: (kind) =>
    voiceErrorMap[kind as keyof typeof voiceErrorMap] ?? {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
    },
});
