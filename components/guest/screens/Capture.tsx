import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { useCamera } from "@/hooks/use-camera";
import { PendingStatusBadge } from "@/components/guest/pending-status-badge";
import {
  canDeletePhoto,
  canRetakePhoto,
  localBudgetRemaining,
  type PendingPhoto,
} from "@/lib/pending-photos";
import type { Usage } from "@/lib/usage";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };
type SessionData = Usage & { guest_name: string | null };

const PRE_EXPIRY_WARN_SECONDS = 300;

/**
 * CAPTURE — 3-zone photobooth studio (DESIGN.md §5.3, owner-ratified
 * 2026-08-21): minimal top bar (camera switch + DM Mono counter), isolated
 * 9:16 frame viewport, dedicated bottom control dock (pending strip, file
 * picker, shutter, advance). The bounded viewport keeps the frame art clear
 * of all controls and matches the compositor's cover-crop exactly (WYSIWYG
 * 1080×1920). Gold is reserved for the shutter and the advance action.
 * Voice recording is a dedicated later step (VOICE_NOTE, DESIGN.md §5.5) —
 * this screen is camera-only.
 */
export function Capture({
  event,
  session,
  pendingPhotos,
  secondsLeft,
  reviewIndex,
  camera,
  selectedFrame,
  onShutter,
  onFileSelect,
  onAdvance,
  onDeletePhoto,
  onRetakePhoto,
  onRetryPhoto,
  onReviewPhoto,
  onCloseReview,
}: {
  event: EventData;
  session: SessionData;
  pendingPhotos: PendingPhoto[];
  secondsLeft: number | null;
  reviewIndex: number | null;
  camera: ReturnType<typeof useCamera>;
  selectedFrame: { src?: string } | null;
  onShutter: () => void;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onAdvance: () => void;
  onDeletePhoto: (id: string) => void;
  onRetakePhoto: (id: string) => void;
  onRetryPhoto: (id: string) => void;
  onReviewPhoto: (index: number) => void;
  onCloseReview: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Shutter press flash (150ms scale handled by active:, plus a brief opacity flash overlay)
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const closed = event.status === "CLOSED";
  const serverAccepted = session.photos_submitted;
  const budgetRemaining = localBudgetRemaining(serverAccepted, pendingPhotos);
  const totalBudget = session.photos_submitted + session.photos_remaining;
  const shutterDisabled = closed || budgetRemaining <= 0 || camera.permission !== "granted";
  const showPreExpiryWarning =
    secondsLeft !== null && secondsLeft <= PRE_EXPIRY_WARN_SECONDS && secondsLeft > 0;
  const canAdvance = pendingPhotos.length > 0 || budgetRemaining === 0;

  function handleShutter() {
    if (shutterDisabled) return;
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 150);
    onShutter();
  }

  return (
    <main className="bg-bg-base text-text-primary select-none">
      {/* 3-zone photobooth studio — column flex, no floating HUD bands */}
      <section
        aria-labelledby="capture-heading"
        className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden"
      >
        <h2 id="capture-heading" ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Take photos
        </h2>

        {/* Ambient backdrop — blurred clone of the active frame art behind all
            zones, with a dark wash so dock controls stay legible. */}
        {selectedFrame?.src && (
          <div aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none">
            <img
              src={selectedFrame.src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover blur-[80px] opacity-35 scale-125"
            />
            <div className="absolute inset-0 bg-bg-base/40" />
          </div>
        )}

        {/* ZONE 1 — minimal top bar: camera switch (left) + DM Mono counter (right) */}
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center">
            {camera.cameraCount >= 2 ? (
              <button
                type="button"
                onClick={camera.switchCamera}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-base/60 backdrop-blur-md border border-border/60 text-sm font-semibold text-text-primary shadow-lg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Switch camera"
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : (
              <div className="h-11 w-11" />
            )}
          </div>

          {/* DM Mono photo counter */}
          <p
            className="flex h-10 min-w-10 items-center justify-center rounded-full bg-bg-base/60 backdrop-blur-md border border-border/60 px-3 font-mono text-xs tabular-nums text-text-primary shadow-lg"
            aria-live="polite"
            aria-label={`${budgetRemaining} of ${totalBudget} photos remaining`}
          >
            {budgetRemaining} / {totalBudget}
          </p>
        </div>

        {/* Status banners (Closed / Session Expiring) — in flow under the top bar */}
        {(closed || showPreExpiryWarning) && (
          <div className="relative z-10 shrink-0 space-y-2 px-4 pb-2">
            {closed && (
              <div
                role="alert"
                className="rounded-xl border border-border bg-bg-elevated/95 backdrop-blur-md p-3 shadow-xl"
              >
                <p className="text-sm font-semibold text-text-secondary">Acara sudah selesai</p>
                <p className="text-xs text-text-secondary">
                  Sesimu masih bisa dilihat, tapi kiriman baru nggak diterima lagi.
                </p>
              </div>
            )}
            {showPreExpiryWarning && (
              <div
                role="status"
                className="rounded-xl border border-border bg-bg-elevated/95 backdrop-blur-md p-3 shadow-xl"
              >
                <p className="text-xs font-medium text-text-primary">
                  Sesi kamu habis dalam {Math.ceil(secondsLeft! / 60)} menit. Kirim fotonya biar tersimpan.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ZONE 2 — isolated 9:16 frame viewport (frame art breathes, no UI on top).
            Container queries size the box to the largest exact 9:16 rectangle
            that fits: min(content width, content height × 9/16). */}
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-2 pb-2 [container-type:size]">
          <div className="relative aspect-[9/16] w-[min(100cqw,calc(100cqh*9/16))] overflow-hidden rounded-2xl shadow-[0_10px_50px_var(--overlay)]">
            <CameraViewfinder camera={camera} frameOverlaySrc={selectedFrame?.src} />

            {/* Shutter flash overlay — scoped to the viewport box */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-text-primary transition-opacity duration-fast z-20 ${
                flash ? "opacity-40" : "opacity-0"
              }`}
            />
          </div>
        </div>

        {/* ZONE 3 — dedicated bottom control dock (thumb zone, document flow) */}
        <div className="relative z-10 shrink-0 space-y-2.5 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
          {/* Pending Photo Thumbnails Strip */}
          {pendingPhotos.length > 0 && (
            <div className="flex justify-center">
              <PendingStrip photos={pendingPhotos} onReview={onReviewPhoto} onRetry={onRetryPhoto} />
            </div>
          )}

          {/* Primary Action Row: [File Upload] - [Gold Shutter] - [Advance Button] */}
          <div className="flex items-center justify-between gap-3 max-w-sm mx-auto w-full">

            {/* Left Slot: Icon File Picker Button */}
            <div className="flex-1 flex justify-start">
              <label
                aria-label="Choose a photo"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-base/70 backdrop-blur-md border border-border/70 text-text-secondary transition active:scale-95 cursor-pointer hover:text-text-primary focus-within:outline-2 focus-within:outline-accent shadow-lg"
              >
                <span className="sr-only">Choose a photo</span>
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={onFileSelect}
                  disabled={closed || budgetRemaining <= 0}
                />
              </label>
            </div>

            {/* Center Slot: Luxury Gold Shutter Button */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <button
                type="button"
                onClick={handleShutter}
                disabled={shutterDisabled}
                className="h-[72px] w-[72px] shrink-0 rounded-full border-4 border-bg-base bg-accent shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_45%,transparent),0_0_40px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition duration-fast ease-out hover:shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_65%,transparent)] active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Take photo"
              />
            </div>

            {/* Right Slot: Advance "Lanjut →" or Spacer */}
            <div className="flex-1 flex justify-end">
              {canAdvance ? (
                <button
                  type="button"
                  onClick={onAdvance}
                  disabled={closed}
                  className="flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-xs font-bold text-on-accent transition duration-fast hover:brightness-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 shadow-lg"
                >
                  Lanjut →
                </button>
              ) : (
                <div className="h-11 w-full" />
              )}
            </div>

          </div>

          {/* Budget Limit Warning Notice */}
          {budgetRemaining <= 0 && !closed && (
            <p className="text-center text-[11px] text-text-muted font-medium drop-shadow-sm">
              Batas foto untuk sesi ini sudah terpakai.
            </p>
          )}

        </div>
      </section>

      {/* Review Overlay Dialog */}
      {reviewIndex !== null && reviewIndex < pendingPhotos.length && (
        <ReviewOverlay
          photo={pendingPhotos[reviewIndex]}
          canRetake={canRetakePhoto(pendingPhotos[reviewIndex].status)}
          canDelete={canDeletePhoto(pendingPhotos[reviewIndex].status)}
          onClose={onCloseReview}
          onRetake={() => onRetakePhoto(pendingPhotos[reviewIndex].id)}
          onDelete={() => onDeletePhoto(pendingPhotos[reviewIndex].id)}
        />
      )}
    </main>
  );
}

function CameraViewfinder({
  camera,
  frameOverlaySrc,
}: {
  camera: ReturnType<typeof useCamera>;
  frameOverlaySrc?: string;
}) {
  const { stream, permission } = camera;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (permission === "idle" || permission === "requesting") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
        <p className="text-sm text-text-muted">Nyalain kamera…</p>
      </div>
    );
  }

  if (permission === "denied" || permission === "unsupported") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base px-4">
        <div className="max-w-sm rounded-xl border border-border bg-bg-elevated p-4 shadow-2xl">
          <p className="text-sm text-text-secondary leading-relaxed">
            {permission === "denied"
              ? "Akses kamera nggak diberi. Kamu masih bisa pilih foto dari galeri di bawah."
              : "Kamera nggak tersedia di browser ini. Kamu masih bisa pilih foto dari galeri di bawah."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-bg-base overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        aria-label="Camera preview"
      />
      {/* object-cover on the 9:16 asset inside the 9:16 viewport box matches the
          compositor's full-canvas draw exactly (WYSIWYG, DESIGN.md §5.3). */}
      {frameOverlaySrc && (
        <img
          src={frameOverlaySrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function PendingStrip({
  photos,
  onReview,
  onRetry,
}: {
  photos: PendingPhoto[];
  onReview: (index: number) => void;
  onRetry: (id: string) => void;
}) {
  return (
    // pt-7 + -mt-7: keeps the strip's layout position unchanged while giving
    // the scrollport 28px of top room so the retry button's enlarged hit
    // zone (which overhangs the thumbnail upward) is not clipped by
    // overflow-x-auto (overflow-y computes to auto and clips top overhang).
    <div className="-mt-7 flex gap-2 overflow-x-auto px-2 pt-7 pb-1 max-w-full" role="list" aria-label="Captured photos">
      {photos.map((photo, index) => (
        <div key={photo.id} role="listitem" className="relative shrink-0 animate-develop">
          <button
            type="button"
            onClick={() => onReview(index)}
            className="block h-12 w-12 overflow-hidden rounded-lg border-2 border-border/80 bg-bg-surface shadow-md focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`Photo ${index + 1}, ${photo.status}`}
          >
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
          <PendingStatusBadge status={photo.status} />
          {photo.status === "error" && (
            // 44×44 hit area: invisible padded button; the 20px visual chip
            // keeps its exact corner position (bottom-right of the box). The
            // zone extends 24px up (free space) and 24px left over the top
            // strip of THIS photo's own thumbnail only — never onto the
            // neighboring item (gap is 8px; right overhang stays 4px).
            <button
              type="button"
              onClick={() => onRetry(photo.id)}
              className="group absolute -right-1 -top-7 flex h-11 w-11 items-end justify-end focus-visible:outline-none"
              aria-label="Retry upload"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-error text-xs font-bold text-text-primary shadow-md group-focus-visible:outline-2 group-focus-visible:outline-accent"
              >
                ↻
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ReviewOverlay({
  photo,
  canRetake,
  canDelete,
  onClose,
  onRetake,
  onDelete,
}: {
  photo: PendingPhoto;
  canRetake: boolean;
  canDelete: boolean;
  onClose: () => void;
  onRetake: () => void;
  onDelete: () => void;
}) {
  // shadcn Dialog (Radix) owns role="dialog"/aria-modal, the focus trap,
  // Escape/backdrop close and initial focus — the former hand-rolled trap,
  // panelRef and initial-focus effect are intentionally deleted.
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-labelledby="review-overlay-title"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-base/95 backdrop-blur-md border-0 rounded-none max-w-full max-h-full w-full h-full p-4 gap-0 outline-none translate-x-0 translate-y-0 sm:max-w-full"
      >
        <h2 id="review-overlay-title" className="sr-only">Photo review</h2>

        {/* Hero photo — exact 9:16, uncropped 1080×1920 composited capture.
            Status pill is absolutely positioned inside the photo box. */}
        <div className="relative aspect-[9/16] w-full max-w-[min(85vw,calc(72dvh*9/16))] overflow-hidden rounded-2xl border border-border/40 bg-bg-base shadow-[0_16px_60px_rgba(0,0,0,0.9)] mx-auto">
          <img src={photo.previewUrl} alt="Photo review" className="absolute inset-0 h-full w-full object-contain" />

          {/* Status pill — strings verbatim (e2e/a11y locked) */}
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 flex w-fit items-center gap-2 rounded-full border border-border/60 bg-bg-elevated/70 px-3 py-1 text-xs backdrop-blur-md">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                photo.status === "confirmed"
                  ? "bg-accent"
                  : photo.status === "uploading"
                    ? "bg-accent"
                    : photo.status === "error" || photo.status === "expired"
                      ? "bg-error"
                      : "bg-text-muted"
              }`}
            />
            <span className="font-medium text-text-primary">
              {photo.status === "pending"
                ? "Belum terkirim"
                : photo.status === "uploading"
                  ? "Ngirim…"
                  : photo.status === "confirmed"
                    ? "Tersimpan"
                    : photo.status === "error"
                      ? "Belum tersimpan"
                      : photo.status === "expired"
                        ? "Belum tersimpan — sesi habis"
                        : photo.status}
            </span>
          </p>
        </div>

        {photo.errorMessage && (
          <p role="alert" className="text-xs text-error text-center mt-3">
            {photo.errorMessage}
          </p>
        )}

        {/* Action row — thumb zone, safe-area padded */}
        <div className="flex gap-2.5 w-full max-w-[min(85vw,calc(72dvh*9/16))] mx-auto mt-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Kembali"
            className="flex-1 h-12 rounded-xl border border-border bg-bg-surface/80 text-xs font-semibold text-text-primary transition active:scale-95 hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
          >
            Kembali
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              aria-label="Ulangi"
              className="flex-1 h-12 rounded-xl gold-foil-btn text-xs font-bold transition active:scale-95 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Ulangi
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Hapus"
              className="flex-1 h-12 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-semibold text-red-400 transition active:scale-95 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Hapus
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}