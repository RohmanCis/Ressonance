import { useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";
import type { Usage } from "@/lib/usage";

type VoiceState =
  | "idle"
  | "recording"
  | "review"
  | "submitting"
  | "success"
  | "error"
  | "review-error"
  | "unsupported";
type SessionData = Usage & { guest_name: string | null };
type EventData = { title: string; status: "ACTIVE" | "CLOSED" };

const MAX_SECONDS = 30;

function formatTimer(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * VOICE_NOTE — dedicated full-screen voice recording step (DESIGN.md §5.5),
 * reached after PHOTO_REVIEW syncs. Gold mic button, DM Mono timer
 * (00:00 / 00:30), pulse-free recording status; review state with playback,
 * duration check (<5s warning), re-record and gold submit CTA; skip link
 * advances to Done. One voice note, 5–30s; the backend stays authoritative
 * for duration. MediaRecorder/voiceUrl/timers are owned by the parent
 * (guest-event-entry): reset/submit/skip handlers handle teardown.
 */
export function VoiceRecordingScreen({
  event,
  session,
  voiceState,
  voiceSeconds,
  voiceUrl,
  voiceMessage,
  onRecord,
  onStop,
  onReset,
  onSubmit,
  onSkip,
}: {
  event: EventData;
  session: SessionData;
  voiceState: VoiceState;
  voiceSeconds: number;
  voiceUrl: string;
  voiceMessage: string;
  onRecord: () => void;
  onStop: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const closed = event.status === "CLOSED";
  const limit = !session.voice_note_available;
  const recording = voiceState === "recording";
  const submitting = voiceState === "submitting";
  const reviewing =
    voiceState === "review" ||
    voiceState === "review-error" ||
    submitting ||
    voiceState === "success";
  const showMic = voiceState === "idle" || voiceState === "error" || recording;

  return (
    <main className="flex min-h-dvh flex-col bg-bg-base text-text-primary">
      <header className="px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
        <p className="truncate text-xs font-medium tracking-[0.04em] text-text-muted">{event.title}</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight outline-none sm:text-4xl"
        >
          Tinggalkan Pesan Suara
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Tinggalkan satu pesan suara hingga 30 detik untuk host.
        </p>
      </header>

      {/* Center stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6">
        {limit ? (
          <p role="status" className="max-w-sm text-center text-sm text-text-muted">
            Voice-note limit reached for this guest session.
          </p>
        ) : closed ? (
          <p role="alert" className="max-w-sm text-center text-sm text-text-muted">
            This event is closed. New submissions are not accepted.
          </p>
        ) : voiceState === "unsupported" ? (
          <p role="alert" className="max-w-sm text-center text-sm text-text-muted">
            {voiceMessage}
          </p>
        ) : reviewing ? (
          <div className="w-full max-w-md space-y-3">
            <audio controls src={voiceUrl} className="w-full" aria-label="Voice note playback" />
            <p className="text-center text-sm text-text-muted">
              Duration: <span className="font-mono tabular-nums">{voiceSeconds}s</span>
            </p>
            {voiceSeconds < 5 && (
              <p role="status" className="text-center text-sm text-text-secondary">
                Pesan terlalu singkat — minimal 5 detik
              </p>
            )}
          </div>
        ) : showMic ? (
          <>
            <button
              type="button"
              onClick={recording ? onStop : onRecord}
              aria-label={recording ? "Stop recording" : "Record voice note"}
              className={`flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-fast active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                recording
                  ? "bg-error text-text-primary"
                  : "bg-accent text-on-accent"
              }`}
            >
              {recording ? (
                <Square className="h-7 w-7" aria-hidden="true" />
              ) : (
                <Mic className="h-9 w-9" aria-hidden="true" />
              )}
            </button>
            <p className="font-mono text-xl tabular-nums text-text-primary" aria-live="polite">
              {formatTimer(voiceSeconds)} / {formatTimer(MAX_SECONDS)}
            </p>
            {recording && (
              <p role="status" className="text-sm font-semibold text-text-primary">
                Recording
              </p>
            )}
            {voiceState === "idle" && (
              <p className="max-w-sm text-center text-sm text-text-muted">
                Microphone permission will be requested after you choose Record.
              </p>
            )}
            {voiceState === "error" && (
              <p role="alert" className="max-w-sm text-center text-sm text-text-muted">
                {voiceMessage}
              </p>
            )}
          </>
        ) : null}

        {/* Status / progress messages */}
        {reviewing && voiceState === "review" && voiceMessage && (
          <p role="status" className="max-w-sm text-center text-sm text-text-muted">
            {voiceMessage}
          </p>
        )}
        {submitting && (
          <p role="status" className="max-w-sm text-center text-sm text-text-muted">
            {voiceMessage}
          </p>
        )}
        {voiceState === "review-error" && (
          <p role="alert" className="max-w-sm text-center text-sm text-text-muted">
            {voiceMessage}
          </p>
        )}
      </div>

      {/* Bottom action band */}
      <div className="space-y-2 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        {reviewing && (
          <>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || closed || voiceState === "success"}
              className="min-h-12 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? "Mengirim…" : "Kirim Pesan Suara"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={submitting}
              className="min-h-12 w-full rounded-lg border border-border bg-bg-surface px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              Rekam Ulang
            </button>
          </>
        )}
        {!recording && !submitting && voiceState !== "success" && (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-12 w-full rounded-md px-4 text-sm font-semibold text-text-secondary transition-colors duration-fast hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Lewati — Kirim Foto Saja
          </button>
        )}
      </div>
    </main>
  );
}
