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
 * Vintage cassette visual (Luxury Analog). Spools and level bars animate
 * strictly during the `recording` state; idle/review render them static.
 */
function Cassette({ recording }: { recording: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-xs rounded-xl border border-border bg-bg-surface px-6 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center justify-between gap-4">
        <Spool spinning={recording} />
        {/* Level window */}
        <div className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-bg-base px-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-8 w-1.5 origin-center rounded-full bg-accent ${
                recording ? "animate-wave-pulse" : "scale-y-[0.3]"
              }`}
              style={recording ? { animationDelay: `${i * 120}ms` } : undefined}
            />
          ))}
        </div>
        <Spool spinning={recording} />
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[0.6rem] tracking-[0.2em] text-text-muted">
        <span>SIDE A</span>
        <span>60</span>
      </div>
    </div>
  );
}

function Spool({ spinning }: { spinning: boolean }) {
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-border bg-bg-elevated ${
        spinning ? "animate-spin-tape" : ""
      }`}
    >
      {/* Spokes */}
      <span className="relative block h-8 w-8 rounded-full border border-border bg-bg-base">
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border" />
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      </span>
    </span>
  );
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
            <Cassette recording={recording} />
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
              className="gold-foil-btn min-h-12 w-full rounded-lg px-4 font-semibold transition duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-45"
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
