import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { useCamera } from "@/hooks/use-camera";
import {
  PendingStatusBadge,
  PendingUploadingRing,
  statusPillDotClass,
  statusPillLabel,
} from "@/components/guest/pending-status-badge";
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

const photoStatusWord: Record<PendingPhoto["status"], string> = {
  pending: "belum terkirim",
  uploading: "lagi dikirim",
  confirmed: "tersimpan",
  error: "gagal terkirim",
  expired: "sesi habis",
};

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
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutterLock = useRef(false);
  const shutterLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (shutterLockTimer.current) clearTimeout(shutterLockTimer.current);
    };
  }, []);

  const closed = event.status === "CLOSED";
  const serverAccepted = session.photos_submitted;
  const budgetRemaining = localBudgetRemaining(serverAccepted, pendingPhotos);
  const totalBudget = session.photos_submitted + session.photos_remaining;
  const shutterDisabled =
    closed || budgetRemaining <= 0 || camera.permission !== "granted";
  const showPreExpiryWarning =
    secondsLeft !== null &&
    secondsLeft <= PRE_EXPIRY_WARN_SECONDS &&
    secondsLeft > 0;
  const canAdvance = pendingPhotos.length > 0 || budgetRemaining === 0;

  function handleShutter() {
    if (shutterDisabled || shutterLock.current) return;
    shutterLock.current = true;
    if (shutterLockTimer.current) clearTimeout(shutterLockTimer.current);
    shutterLockTimer.current = setTimeout(() => {
      shutterLock.current = false;
      shutterLockTimer.current = null;
    }, 500);

    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(40);
    }

    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 150);
    onShutter();
  }

  return (
    <main className="relative flex h-dvh max-h-dvh w-full flex-col justify-between overflow-hidden bg-bg-base text-text-primary select-none">
      <h2
        id="capture-heading"
        ref={headingRef}
        tabIndex={-1}
        className="sr-only outline-none"
      >
        Jepret foto
      </h2>

      {/* Ambient Stage Lighting: Pendaran hangat di tengah latar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_45%,_rgba(212,175,55,0.08)_0%,_rgba(0,0,0,0.4)_55%,_transparent_100%)]"
      />

      {/* Ambient Aura Frame */}
      {selectedFrame?.src && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <img
            src={selectedFrame.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover blur-[110px] opacity-25 scale-125"
          />
        </div>
      )}

      {/* ZONA 1: TOP BAR (Di luar area frame - aman dari teks atas) */}
      <header className="relative z-20 flex shrink-0 flex-col gap-1.5 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-1">
        <div className="flex items-center justify-between">
          {camera.cameraCount >= 2 ? (
            <button
              type="button"
              onClick={camera.switchCamera}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-surface/70 backdrop-blur-md border border-border/80 text-text-primary shadow-md transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Ganti kamera"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <div className="h-10 w-10" />
          )}

          <p
            className="flex h-8 items-center justify-center rounded-full bg-bg-surface/70 backdrop-blur-md border border-accent/40 px-3 font-mono text-xs font-semibold tabular-nums text-text-primary shadow-md"
            aria-live="polite"
            aria-label={`Foto ${budgetRemaining} dari ${totalBudget}`}
          >
            <span className="text-accent mr-1.5 font-bold">FOTO</span>
            {budgetRemaining} / {totalBudget}
          </p>
        </div>

        {(closed || showPreExpiryWarning) && (
          <div className="space-y-1">
            {closed && (
              <div
                role="alert"
                className="rounded-lg border border-border bg-bg-elevated/95 p-2 text-center shadow-lg"
              >
                <p className="text-xs font-semibold text-text-secondary">
                  Acara sudah selesai
                </p>
              </div>
            )}
            {showPreExpiryWarning && (
              <div
                role="status"
                className="rounded-lg border border-accent/40 bg-bg-elevated/95 p-1.5 text-center shadow-lg"
              >
                <p className="text-[11px] font-medium text-text-primary">
                  Sisa waktu {Math.ceil(secondsLeft! / 60)} menit. Kirim fotomu
                  segera.
                </p>
              </div>
            )}
          </div>
        )}
      </header>

      {/* 2. ZONA 2: FRAME STAGE SEAMLESS (Ganti bagian kontainer kartu ini) */}
      <section className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-1 [container-type:size]">
        {/* Box 9:16 yang pas di kedua sumbu: min(content width, content height × 9/16) */}
        <div className="relative aspect-[9/16] w-[min(100cqw,calc(100cqh*9/16))] overflow-hidden rounded-[24px] ring-1 ring-white/10 ring-inset shadow-[0_20px_50px_-10px_rgba(0,0,0,0.9),0_0_40px_-15px_rgba(212,175,55,0.15)] transition-[box-shadow,opacity] duration-base">
          <CameraViewfinder
            camera={camera}
            frameOverlaySrc={selectedFrame?.src}
          />

          {/* Shutter Flash */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-fast z-20 ${
              flash ? "opacity-45" : "opacity-0"
            }`}
          />
        </div>
      </section>

      {/* ZONA 3: DEDICATED BOTTOM DOCK (Di bawah frame - bebas tabrakan nama pengantin) */}
      <footer className="relative z-20 flex shrink-0 flex-col gap-2 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {/* Pending Strip Thumbnail */}
        {pendingPhotos.length > 0 && (
          <div className="flex justify-center">
            <PendingStrip
              photos={pendingPhotos}
              onReview={onReviewPhoto}
              onRetry={onRetryPhoto}
            />
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between gap-3 max-w-xs mx-auto w-full">
          {/* File Picker Galeri */}
          <div className="flex-1 flex justify-start">
            <label
              aria-label="Pilih foto"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-surface/80 backdrop-blur-md border border-border text-text-secondary transition active:scale-95 cursor-pointer hover:text-text-primary shadow-lg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
            >
              <span className="sr-only">Pilih foto</span>
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                onChange={onFileSelect}
                disabled={closed || budgetRemaining <= 0}
              />
            </label>
          </div>

          {/* Shutter Emas */}
          <div className="flex shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={handleShutter}
              disabled={shutterDisabled}
              className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-bg-surface/80 p-1 ring-2 ring-accent/30 shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition duration-fast active:scale-90 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Jepret foto"
            >
              <div className="h-full w-full rounded-full border border-black/30 bg-gradient-to-tr from-amber-600 via-accent to-yellow-200 shadow-inner" />
            </button>
          </div>

          {/* Tombol Lanjut */}
          <div className="flex-1 flex justify-end">
            {canAdvance ? (
              <button
                type="button"
                onClick={onAdvance}
                disabled={closed}
                className="flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-xs font-bold text-on-accent shadow-lg transition duration-fast hover:brightness-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                Lanjut →
              </button>
            ) : (
              <div className="h-11 w-11" />
            )}
          </div>
        </div>

        {budgetRemaining <= 0 && !closed && (
          <p className="text-center text-[10px] text-text-muted font-medium">
            Batas foto untuk sesi ini sudah terpakai.
          </p>
        )}
      </footer>

      {/* Review Dialog */}
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
  const { stream, permission, facingMode } = camera;
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
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base px-6">
        <div className="max-w-xs rounded-xl border border-border bg-bg-elevated p-4 shadow-xl text-center">
          <p className="text-xs text-text-secondary leading-relaxed">
            {permission === "denied"
              ? "Akses kamera nggak diberi. Kamu masih bisa pilih foto dari galeri di bawah."
              : "Kamera nggak tersedia di browser ini. Kamu masih bisa pilih foto dari galeri di bawah."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-fast ${
          facingMode === "user" ? "-scale-x-100" : ""
        }`}
        aria-label="Pratinjau kamera"
      />

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
    <div
      className="flex gap-2 overflow-x-auto px-2 py-0.5 max-w-full"
      role="list"
      aria-label="Foto yang udah dijepret"
    >
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          role="listitem"
          className="relative shrink-0 animate-develop"
        >
          <button
            type="button"
            onClick={() => onReview(index)}
            className="relative block h-11 w-11 overflow-hidden rounded-lg border border-border/80 bg-bg-surface shadow-md focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`Foto ${index + 1}, ${photoStatusWord[photo.status]}`}
          >
            <img
              src={photo.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {photo.status === "uploading" && <PendingUploadingRing />}
          </button>
          <PendingStatusBadge status={photo.status} />
          {photo.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(photo.id)}
              className="group absolute -right-1 -top-1 flex h-11 w-11 items-start justify-end rounded-full pt-0.5 focus-visible:outline-none"
              aria-label="Kirim ulang"
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-4 items-center justify-center rounded-full bg-error text-[9px] font-bold text-text-primary shadow-md"
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
  return (
    <Dialog
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-labelledby="review-overlay-title"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-base/95 backdrop-blur-md border-0 rounded-none max-w-full max-h-full w-full h-full p-4 gap-0 outline-none translate-x-0 translate-y-0 sm:max-w-full"
      >
        <h2 id="review-overlay-title" className="sr-only">
          Tinjau foto
        </h2>

        <div className="relative aspect-[9/16] w-full max-w-[min(88vw,calc(75dvh*9/16))] overflow-hidden rounded-2xl border border-border/40 bg-black shadow-2xl mx-auto">
          <img
            src={photo.previewUrl}
            alt="Tinjau foto"
            className="absolute inset-0 h-full w-full object-contain"
          />

          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 flex w-fit items-center gap-2 rounded-full border border-border/60 bg-bg-elevated/80 px-3 py-1 text-xs backdrop-blur-md">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${statusPillDotClass(
                photo.status,
              )}`}
            />
            <span className="font-medium text-text-primary">
              {statusPillLabel(photo.status)}
            </span>
          </p>
        </div>

        {photo.errorMessage && (
          <p role="alert" className="text-xs text-error text-center mt-3">
            {photo.errorMessage}
          </p>
        )}

        <div className="flex gap-2.5 w-full max-w-[min(88vw,calc(75dvh*9/16))] mx-auto mt-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Kembali"
            className="flex-1 h-11 rounded-xl border border-border bg-bg-surface/80 text-xs font-semibold text-text-primary transition active:scale-95 hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
          >
            Kembali
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              aria-label="Ulangi"
              className="flex-1 h-11 rounded-xl border border-border bg-bg-surface/80 text-xs font-semibold text-text-primary transition active:scale-95 hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-accent"
            >
              Ulangi
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Hapus"
              className="flex-1 h-11 rounded-xl border border-error/30 bg-error/10 text-xs font-semibold text-error transition active:scale-95 hover:bg-error/20 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Hapus
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
