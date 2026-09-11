import { useEffect, useRef } from "react";
import { X, RotateCcw, Sparkles, ArrowLeft, Camera, Plus } from "lucide-react";
import { canDeletePhoto, type PendingPhoto } from "@/lib/pending-photos";
import {
  PendingStatusBadge,
  PendingUploadingRing,
} from "@/components/guest/pending-status-badge";
import { AmbientBackdrop } from "@/components/guest/ambient-backdrop";
import { ExpiryHint } from "./expiry-hint";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };

const MAX_PHOTOS = 5;

export function PhotoReview({
  event,
  photos,
  syncing,
  secondsLeft,
  onDeletePhoto,
  onRetryPhoto,
  onNext,
  onBack,
}: {
  event: EventData;
  photos: PendingPhoto[];
  syncing: boolean;
  secondsLeft: number | null;
  onDeletePhoto: (id: string) => void;
  onRetryPhoto: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const closed = event.status === "CLOSED";
  const hasPending = photos.some((p) => p.status === "pending");
  const hasErrors = photos.some((p) => p.status === "error");
  const allConfirmed = photos.every((p) => p.status === "confirmed");
  const errorCount = photos.filter((p) => p.status === "error").length;

  const canAddMore = photos.length < MAX_PHOTOS && !closed;

  const ctaDisabled =
    syncing || (!allConfirmed && !hasPending) || (closed && !allConfirmed);

  return (
    <main className="relative flex min-h-dvh flex-col justify-between overflow-x-hidden bg-bg-base text-text-primary select-none">
      <AmbientBackdrop />

      {/* HEADER SECTION */}
      <header className="relative z-10 shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 text-center sm:px-8">
        {/* Top Navigation Bar: Tombol Kembali ke Kamera */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={onBack}
            disabled={syncing}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-bg-surface/70 px-3.5 text-xs font-medium text-text-secondary backdrop-blur-md border border-border/60 transition-transform active:scale-95 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
            aria-label="Kembali ke kamera"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Kamera</span>
          </button>

          <p className="truncate font-script text-xl text-accent drop-shadow-sm max-w-[200px]">
            {event.title}
          </p>

          <div className="w-10" />
        </div>

        <div
          aria-hidden="true"
          className="flex items-center justify-center gap-3 my-2"
        >
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-accent/60" />
          <span className="h-1 w-1 rotate-45 bg-accent/80" />
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-accent/60" />
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-medium tracking-tight text-text-primary outline-none"
        >
          Foto Pilihanmu{" "}
          <span className="font-mono text-xl text-accent tabular-nums">
            ({photos.length}/{MAX_PHOTOS})
          </span>
        </h1>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
          Mau jepret ulang, hapus, atau lanjut? Bisa semua.
        </p>

        {/* Expiry Hint */}
        <div className="mt-2.5 max-w-sm mx-auto">
          <ExpiryHint
            secondsLeft={secondsLeft}
            message={`Sesi habis dalam ${Math.ceil((secondsLeft ?? 0) / 60)} menit. Kirim fotonya biar tersimpan.`}
          />
        </div>
      </header>

      {/* CONTENT GALLERY */}
      <div className="relative z-10 flex-1 px-4 py-2 sm:px-8 max-w-lg mx-auto w-full flex flex-col justify-center">
        <section className="relative overflow-hidden rounded-2xl border border-accent/20 bg-bg-surface/80 p-4 shadow-[0_15px_45px_rgba(0,0,0,0.8),0_0_30px_color-mix(in_srgb,var(--accent)_6%,transparent)] backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 px-1 border-b border-border/40">
            <span className="font-mono text-[11px] font-semibold tracking-wider text-text-muted">
              GALERI SESI INI
            </span>
            <span className="text-[11px] text-text-muted">
              {photos.length === MAX_PHOTOS ? "Kuota Penuh" : `Sisa ${MAX_PHOTOS - photos.length} Foto`}
            </span>
          </div>

          {photos.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center gap-1.5 py-10 text-center">
              <p className="text-xs font-medium text-text-secondary">
                Belum ada foto yang dijepret di sesi ini.
              </p>
              <p className="text-[11px] text-text-muted">
                Ambil foto dulu dari kamera biar bisa lanjut.
              </p>
            </div>
          ) : (
          <ul
            className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3"
            aria-label="Foto yang udah dijepret"
          >
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className="relative animate-develop"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border/70 bg-black/50 shadow-md">
                  <img
                    src={photo.previewUrl}
                    alt={`Foto ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {photo.status === "uploading" && <PendingUploadingRing />}
                </div>

                <p className="mt-1 text-center font-mono text-[11px] tabular-nums text-text-secondary">
                  #{index + 1}
                </p>

                <PendingStatusBadge status={photo.status} />

                {/* Tombol Hapus */}
                <button
                  type="button"
                  onClick={() => onDeletePhoto(photo.id)}
                  disabled={!canDeletePhoto(photo.status)}
                  aria-label={`Hapus foto ${index + 1}`}
                  className="group absolute -right-1.5 -top-1.5 flex h-11 w-11 items-start justify-end rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-error/90 text-text-primary shadow-md backdrop-blur-sm transition-transform duration-fast group-active:scale-90 group-focus-visible:outline-2 group-focus-visible:outline-accent"
                  >
                    <X className="h-3.5 w-3.5 stroke-[2.5]" />
                  </span>
                </button>

                {/* Tombol Retry */}
                {photo.status === "error" && (
                  <button
                    type="button"
                    onClick={() => onRetryPhoto(photo.id)}
                    aria-label={`Kirim ulang foto ${index + 1}: ${photo.errorMessage ?? "gagal terkirim"}`}
                    className="group absolute -left-1.5 -top-1.5 flex h-11 w-11 items-start justify-start rounded-full focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-primary shadow-md backdrop-blur-sm transition-transform duration-fast group-active:scale-90 group-focus-visible:outline-2 group-focus-visible:outline-accent"
                    >
                      <RotateCcw className="h-3 w-3 stroke-[2.5]" />
                    </span>
                  </button>
                )}
              </li>
            ))}

            {/* SLOT TAMBAH FOTO INTERAKTIF (Jika kuota belum habis) */}
            {canAddMore && (
              <li className="relative">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Ambil foto tambahan"
                  className="group flex aspect-[9/16] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 transition-transform duration-fast hover:border-accent hover:bg-accent/10 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent group-hover:scale-110 transition-transform">
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                  </div>
                  <span className="text-[10px] font-semibold text-accent/90">
                    Foto Lagi
                  </span>
                </button>
                <p className="mt-1 text-center font-mono text-[11px] text-text-muted">
                  Kosong
                </p>
              </li>
            )}
          </ul>
          )}
        </section>

        {hasErrors && (
          <p role="alert" className="mt-2 text-center text-xs text-error font-medium">
            {errorCount} foto belum tersimpan. Ketuk ↻ buat kirim ulang, atau hapus fotonya sebelum lanjut.
          </p>
        )}

        {closed && !allConfirmed && (
          <p role="status" className="mt-2 text-center text-xs text-text-secondary font-medium">
            Acara ini sudah selesai. Kiriman baru nggak diterima lagi.
          </p>
        )}
      </div>

      {/* FOOTER ACTION BAND (Primary & Secondary CTA) */}
      <footer className="relative z-10 shrink-0 space-y-2 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 sm:px-8 max-w-md mx-auto w-full">
        {syncing && (
          <div className="flex items-center justify-center gap-2 text-xs text-accent">
            <Sparkles className="h-3.5 w-3.5 animate-spin" />
            <span>Lagi ngirim foto…</span>
          </div>
        )}

        {/* Primary Action: Simpan & Lanjut */}
        <button
          type="button"
          onClick={onNext}
          disabled={ctaDisabled}
          className="gold-foil-btn flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold shadow-lg transition-transform duration-fast active:scale-[0.98] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {syncing ? "Mengirim foto…" : "Simpan & Lanjut ke Pesan Suara →"}
        </button>

        {/* Secondary Action: Kembali ke Kamera / Foto Ulang */}
        <button
          type="button"
          onClick={onBack}
          disabled={syncing}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg-surface/50 text-xs font-semibold text-text-secondary transition-transform active:scale-[0.98] hover:text-text-primary hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span>{canAddMore ? "Ambil Foto Tambahan" : "Foto Ulang / Ganti Foto"}</span>
        </button>
      </footer>
    </main>
  );
}