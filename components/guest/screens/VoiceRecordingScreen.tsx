import { useEffect, useRef } from "react";
import { Mic, Square, Sparkles, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { AudioPlayer } from "@/components/guest/audio-player";
import { formatTimer } from "@/lib/format";
import type { Usage } from "@/lib/usage";
import { AmbientBackdrop } from "@/components/guest/ambient-backdrop";
import { ExpiryHint } from "./expiry-hint";

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

const MIN_SECONDS = 5;
const MAX_SECONDS = 30;

/**
 * VOICE_NOTE — Layar perekaman suara mandiri (DESIGN.md §5.5).
 * Backend-authoritative duration (5–30 detik).
 * Zero-scroll lock pada dynamic viewport height (dvh).
 */
export function VoiceRecordingScreen({
  event,
  session,
  voiceState,
  voiceSeconds,
  voiceUrl,
  voiceMessage,
  secondsLeft,
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
  secondsLeft: number | null;
  onRecord: () => void;
  onStop: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus guard dengan preventScroll agar tidak memicu lonjakan viewport di mobile
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
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
  const isDurationValid = voiceSeconds >= MIN_SECONDS;
  const stoppedAfterRecording = ["review", "review-error", "submitting", "success"].includes(voiceState);

  // Haptic feedback saat tombol rekam disentuh di perangkat mobile
  function handleMicToggle() {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(40);
    }
    if (recording) {
      onStop();
    } else {
      onRecord();
    }
  }

  return (
    <main className="relative flex h-dvh max-h-dvh w-full flex-col justify-between overflow-hidden overscroll-none bg-bg-base text-text-primary select-none">
      {/* Latar Belakang Pencahayaan Halus */}
      <AmbientBackdrop />

      {/* Status region: pengumuman perubahan state rekaman (sr-only mirror) */}
      <p role="status" aria-live="polite" className="sr-only">
        {recording ? "Merekam" : stoppedAfterRecording ? "Selesai merekam" : ""}
      </p>

      {/* HEADER SECTION: Compact Vertical Cadence */}
      <header className="relative z-10 shrink-0 px-5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-1 text-center sm:px-8">
        <p className="truncate font-script text-2xl sm:text-3xl text-accent tracking-wide drop-shadow-sm">
          {event.title}
        </p>

        <div aria-hidden="true" className="flex items-center justify-center gap-3 my-1.5">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-accent/60" />
          <span className="h-1.5 w-1.5 rotate-45 bg-accent/80" />
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-accent/60" />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-medium tracking-tight text-text-primary outline-none"
        >
          Tinggalkan Pesan Suara
        </h1>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
          Ungkapkan doa & ucapan hangat untuk kedua mempelai secara personal.
        </p>

        {/* Expiry Hint Alert */}
        <div className="mt-2 max-w-sm mx-auto">
          <ExpiryHint
            secondsLeft={secondsLeft}
            message={`Sesi habis dalam ${Math.ceil((secondsLeft ?? 0) / 60)} menit. Kirim suaramu segera.`}
          />
        </div>
      </header>

      {/* CENTER STAGE: min-h-0 mencegah overflow vertikal di layar ponsel kecil */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-2 max-w-md mx-auto w-full">
        {/* State: Batas Kuota Suara Terpakai */}
        {limit ? (
          <div
            role="alert"
            className="w-full rounded-2xl border border-success/30 bg-bg-surface/85 p-5 text-center shadow-xl backdrop-blur-xl"
          >
            <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2 opacity-90" />
            <h2 className="font-display text-base font-semibold text-text-primary">
              Pesan Suara Tersimpan
            </h2>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
              Satu pesan suaramu sudah berhasil dikirim. Terima kasih atas ucapan dan doa terbaikmu!
            </p>
          </div>
        ) : closed ? (
          /* State: Acara Ditutup */
          <div
            role="status"
            className="w-full rounded-2xl border border-border/80 bg-bg-surface/85 p-5 text-center shadow-xl backdrop-blur-xl"
          >
            <AlertCircle className="h-10 w-10 text-error mx-auto mb-2 opacity-90" />
            <h2 className="font-display text-base font-semibold text-text-primary">
              Acara Sudah Selesai
            </h2>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
              Momen acara telah berakhir. Kiriman pesan baru tidak diterima lagi.
            </p>
          </div>
        ) : voiceState === "unsupported" ? (
          /* State: Browser Tidak Mendukung MediaRecorder */
          <div
            role="status"
            className="w-full rounded-2xl border border-error/30 bg-bg-surface/85 p-5 text-center shadow-xl backdrop-blur-xl"
          >
            <p className="text-xs text-error leading-relaxed">{voiceMessage}</p>
          </div>
        ) : reviewing ? (
          /* STATE REVIEW: Pratinjau Audio yang Sudah Direkam */
          <div className="w-full space-y-3.5 rounded-2xl border border-accent/20 bg-bg-surface/85 p-5 shadow-[0_15px_45px_rgba(0,0,0,0.8),0_0_30px_color-mix(in_srgb,var(--accent)_6%,transparent)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
              <span className="font-mono text-[10px] font-semibold tracking-widest text-text-muted uppercase">
                Pratinjau Suara
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-accent bg-accent/10 px-2.5 py-0.5 rounded-full border border-accent/20">
                {voiceSeconds} detik
              </span>
            </div>

            <div className="py-0.5">
              <AudioPlayer src={voiceUrl} duration={voiceSeconds} />
            </div>

            {!isDurationValid ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-center">
                <p className="text-xs font-semibold text-amber-300">
                  Durasi terlalu singkat ({voiceSeconds} detik)
                </p>
                <p className="mt-0.5 text-[10px] text-text-muted leading-relaxed">
                  Pesan suara minimal 5 detik agar dapat disimpan. Silakan rekam ulang.
                </p>
              </div>
            ) : (
              <p className="text-center text-xs text-text-secondary leading-relaxed">
                Dengarkan rekamanmu sebelum disimpan. Kamu bisa mengulang jika ingin mengubah isi ucapan.
              </p>
            )}
          </div>
        ) : showMic ? (
          /* STATE REKAM: Hero Mic & Clean Minimalist Equalizer Animation */
          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Tombol Mikrofon dengan Soft Breathing Halo (Bukan Ping Merah Kasar) */}
            <div className="relative flex items-center justify-center">
              {recording && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -m-3 rounded-full bg-accent/20 blur-xl animate-pulse duration-[2000ms] pointer-events-none"
                />
              )}

              <button
                type="button"
                onClick={handleMicToggle}
                aria-label={recording ? "Hentikan rekaman" : "Mulai rekam pesan suara"}
                className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-transform duration-base active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${
                  recording
                    ? "bg-bg-surface border-2 border-accent text-accent shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)] scale-105"
                    : "bg-accent text-on-accent shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_45%,transparent)] hover:brightness-105"
                }`}
              >
                {recording ? (
                  <Square className="h-6 w-6 fill-current" aria-hidden="true" />
                ) : (
                  <Mic className="h-8 w-8" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Timer DM Mono & Waveform Bar Minimalis */}
            <div className="flex flex-col items-center space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-text-primary"
                  aria-live="off"
                >
                  {formatTimer(voiceSeconds)}
                </span>
                <span className="font-mono text-xs font-normal text-text-muted">
                  / {formatTimer(MAX_SECONDS)}
                </span>
              </div>

              {/* Minimal Acoustic Waveform Animation (Aktif hanya saat recording) */}
              <div
                aria-hidden="true"
                className="flex items-center justify-center gap-1.5 h-6 px-3 py-1"
              >
                {[35, 70, 100, 55, 85, 45, 90, 60, 40].map((height, i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full ${
                      recording
                        ? "bg-accent animate-pulse"
                        : "bg-border/60 h-1.5"
                    }`}
                    style={
                      recording
                        ? {
                            height: `${height}%`,
                            animationDelay: `${i * 90}ms`,
                            animationDuration: "750ms",
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              {/* Progress Track 0–30s dengan Penanda Minimal 5 Detik (16.6%) */}
              <div className="relative h-1.5 w-52 overflow-hidden rounded-full bg-bg-surface border border-border/70 shadow-inner">
                {/* Milestone Tick 5 Detik */}
                <div
                  className="absolute top-0 bottom-0 left-[16.6%] w-[2px] bg-accent/70 z-10"
                  title="Batas minimal 5 detik"
                />
                <div
                  className={`absolute inset-y-0 left-0 w-full origin-left transition-transform duration-300 ease-linear ${
                    recording ? "bg-accent" : isDurationValid ? "bg-accent" : "bg-accent/60"
                  }`}
                  style={{ transform: `scaleX(${Math.min(1, voiceSeconds / MAX_SECONDS)})` }}
                />
              </div>

              {/* Status Copy Interaktif */}
              {recording ? (
                <div className="flex items-center gap-1.5 pt-0.5 text-xs font-semibold text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  <span>
                    {voiceSeconds < MIN_SECONDS
                      ? `Tahan berbicara… (${MIN_SECONDS - voiceSeconds}s lagi)`
                      : "Sedang merekam… ketuk kotak jika selesai"}
                  </span>
                </div>
              ) : voiceState === "idle" ? (
                <p className="text-center text-xs text-text-muted max-w-xs pt-0.5 leading-relaxed">
                  Ketuk mikrofon untuk mulai berbicara.
                </p>
              ) : null}

              {voiceState === "error" && (
                <p role="alert" className="max-w-xs text-center text-xs font-medium text-error pt-0.5 leading-relaxed">
                  {voiceMessage}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* Feedback Error Pasca Submit/Review */}
        {voiceState === "review-error" && (
          <p role="alert" className="mt-2 text-center text-xs font-medium text-error leading-relaxed">
            {voiceMessage}
          </p>
        )}
      </div>

      {/* FOOTER ACTION BAND: Terkunci di Bawah Safe Area */}
      <footer className="relative z-10 shrink-0 space-y-2 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 sm:px-8 max-w-md mx-auto w-full">
        {reviewing && (
          <>
            {/* Status region: progres submit (sr-only) */}
            {submitting && (
              <p role="status" aria-live="polite" className="sr-only">
                Mengirim pesan suara…
              </p>
            )}
            {/* Primary Action: Kirim Pesan Suara (Client Guard Durasi Minimal 5 Detik) */}
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || closed || !isDurationValid || voiceState === "success"}
              className="gold-foil-btn flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold shadow-lg transition-transform duration-fast active:scale-[0.98] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-spin" />
                  <span>Mengirim Pesan Suara…</span>
                </div>
              ) : (
                "Kirim Pesan Suara →"
              )}
            </button>

            {/* Secondary Action: Rekam Ulang */}
            <button
              type="button"
              onClick={onReset}
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-surface/80 text-xs font-semibold text-text-secondary transition-transform active:scale-[0.98] hover:text-text-primary hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rekam Ulang</span>
            </button>
          </>
        )}

        {/* Tertiary Action: Lewati Suara & Selesai */}
        {!recording && !submitting && voiceState !== "success" && (
          <button
            type="button"
            onClick={onSkip}
            className="flex min-h-11 w-full items-center justify-center text-center text-xs font-medium text-text-muted underline underline-offset-4 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"
          >
            Lewati — Selesai & Kirim Foto Saja
          </button>
        )}
      </footer>
    </main>
  );
}