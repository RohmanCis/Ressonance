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
 * VOICE — full-screen voice-note step of the sequential guest flow
 * (UI_UX §4.5). One voice note, 5–30s; re-record replaces only the unsent
 * in-memory take; the backend remains authoritative for duration.
 */
export function Voice({
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
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
        <p className="truncate text-sm font-medium text-muted-foreground">{event.title}</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight outline-none"
        >
          Pesan suara
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tinggalkan satu pesan suara hingga 30 detik untuk host.
        </p>
      </header>

      {/* Center stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-8">
        {limit ? (
          <p role="status" className="max-w-sm text-center text-sm text-muted-foreground">
            Voice-note limit reached for this guest session.
          </p>
        ) : closed ? (
          <p role="alert" className="max-w-sm text-center text-sm text-muted-foreground">
            This event is closed. New submissions are not accepted.
          </p>
        ) : voiceState === "unsupported" ? (
          <p role="alert" className="max-w-sm text-center text-sm text-muted-foreground">
            {voiceMessage}
          </p>
        ) : reviewing ? (
          <div className="w-full max-w-md space-y-3">
            <audio controls src={voiceUrl} className="w-full" aria-label="Voice note playback" />
            <p className="text-center text-sm text-muted-foreground">
              Duration: <span className="tabular-nums">{voiceSeconds}s</span>
              {voiceSeconds < 5 && <strong className="ml-2">Too short</strong>}
            </p>
            {voiceSeconds < 5 && (
              <p className="text-center text-sm text-muted-foreground">
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
              className={`flex h-24 w-24 items-center justify-center rounded-full shadow-[var(--shadow-2)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                recording
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {recording ? (
                <Square className="h-8 w-8" aria-hidden="true" />
              ) : (
                <Mic className="h-10 w-10" aria-hidden="true" />
              )}
            </button>
            <p className="font-mono text-xl tabular-nums" aria-live="polite">
              {formatTimer(voiceSeconds)} / MAKS {MAX_SECONDS} DETIK
            </p>
            {recording && (
              <p role="status" className="text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block h-3 w-3 animate-pulse rounded-full bg-recording"
                />
                Recording
              </p>
            )}
            {voiceState === "idle" && (
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                Microphone permission will be requested after you choose Record.
              </p>
            )}
            {voiceState === "error" && (
              <p role="alert" className="max-w-sm text-center text-sm text-muted-foreground">
                {voiceMessage}
              </p>
            )}
          </>
        ) : null}

        {/* Status / progress messages */}
        {reviewing && voiceState === "review" && voiceMessage && (
          <p role="status" className="max-w-sm text-center text-sm text-muted-foreground">
            {voiceMessage}
          </p>
        )}
        {submitting && (
          <p role="status" className="max-w-sm text-center text-sm text-muted-foreground">
            {voiceMessage}
          </p>
        )}
        {voiceState === "review-error" && (
          <p role="alert" className="max-w-sm text-center text-sm text-muted-foreground">
            {voiceMessage}
          </p>
        )}
      </div>

      {/* Bottom action band */}
      <div className="space-y-2 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        {limit ? (
          <button
            type="button"
            onClick={onSkip}
            className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Lanjut
          </button>
        ) : reviewing ? (
          <>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || closed || voiceState === "success"}
              className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? "Mengirim…" : "✓ Kirim semua"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={submitting}
              className="min-h-12 w-full rounded-md bg-secondary px-4 font-semibold text-secondary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
            >
              Rekam ulang
            </button>
            {!submitting && (
              <button
                type="button"
                onClick={onSkip}
                className="min-h-11 w-full rounded-md px-4 text-sm font-semibold text-muted-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              className="min-h-11 w-full rounded-md px-4 text-sm font-semibold text-muted-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Lewati &amp; kirim foto saja
            </button>
          )
        )}
      </div>
    </main>
  );
}
