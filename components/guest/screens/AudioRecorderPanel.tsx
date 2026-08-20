import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
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
 * AudioRecorderPanel — voice note as a bottom slide-up panel ON the Capture
 * screen (DESIGN.md §5.3): 350ms ease-out translateY(100%) → 0, bottom ~60%,
 * --bg-elevated surface over a --overlay scrim. No screen change ever occurs
 * while it is open. One voice note, 5–30s; re-record replaces only the
 * unsent in-memory take; closing discards the unsent take. The backend
 * remains authoritative for duration.
 */
export function AudioRecorderPanel({
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
  onClose,
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
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  // Enter transition: mount off-screen, then rise (transform only, §4).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function requestClose() {
    if (voiceState === "submitting" || closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 350); // matches duration-slow exit
  }

  const open = entered && !closing;
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
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Voice note recorder">
      {/* Scrim */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-overlay transition-opacity duration-slow ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel — bottom ~60%, rises on open, sinks on close */}
      <div
        className={`absolute inset-x-0 bottom-0 flex h-[60dvh] flex-col rounded-t-2xl border-t border-border bg-bg-elevated text-text-primary transition-transform duration-slow ${
          open ? "translate-y-0 ease-out" : "translate-y-full ease-in"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between px-5 pt-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-2xl font-semibold leading-tight tracking-tight outline-none"
          >
            Voice note
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close voice recorder"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-secondary transition-opacity duration-fast hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <p className="shrink-0 px-5 pt-1 text-sm text-text-muted">
          Tinggalkan satu pesan suara hingga 30 detik untuk host.
        </p>

        {/* Center stage */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-4">
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
                {voiceSeconds < 5 && <strong className="ml-2 text-text-primary">Too short</strong>}
              </p>
              {voiceSeconds < 5 && (
                <p className="text-center text-sm text-text-muted">
                  Keep recording for at least 5 seconds where possible, then re-record.
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
                {formatTimer(voiceSeconds)} / MAKS {MAX_SECONDS} DETIK
              </p>
              {recording && (
                <p role="status" className="text-sm font-semibold text-text-primary">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block h-3 w-3 animate-pulse rounded-full bg-error"
                  />
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
        <div className="shrink-0 space-y-2 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {limit ? (
            <button
              type="button"
              onClick={onSkip}
              className="min-h-12 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Lanjut
            </button>
          ) : reviewing ? (
            <>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || closed || voiceState === "success"}
                className="min-h-12 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? "Mengirim…" : "✓ Kirim semua"}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={submitting}
                className="min-h-12 w-full rounded-lg border border-border bg-transparent px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                Rekam ulang
              </button>
              {!submitting && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="min-h-11 w-full rounded-md px-4 text-sm font-semibold text-text-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Lewati &amp; kirim foto saja
                </button>
              )}
            </>
          ) : (
            !recording && (
              <button
                type="button"
                onClick={onSkip}
                className="min-h-11 w-full rounded-md px-4 text-sm font-semibold text-text-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Lewati &amp; kirim foto saja
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
