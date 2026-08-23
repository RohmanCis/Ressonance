import { ChangeEvent, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { useCamera } from "@/hooks/use-camera";
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
                ↻
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
                <p className="text-sm font-semibold text-accent">Event closed</p>
                <p className="text-xs text-text-secondary">
                  Your session remains viewable, but new submissions are not accepted.
                </p>
              </div>
            )}
            {showPreExpiryWarning && (
              <div
                role="status"
                className="rounded-xl border border-border bg-bg-elevated/95 backdrop-blur-md p-3 shadow-xl"
              >
                <p className="text-xs font-medium text-text-primary">
                  Your session ends in {Math.ceil(secondsLeft! / 60)} min. Send your photos to save them.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ZONE 2 — isolated 9:16 frame viewport (frame art breathes, no UI on top).
            Container queries size the box to the largest exact 9:16 rectangle
            that fits: min(content width, content height × 9/16). */}
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-2 pb-2 [container-type:size]">
          <div className="relative aspect-[9/16] w-[min(100cqw,calc(100cqh*9/16))] overflow-hidden rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.85)]">
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
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.5" />
                  <path d="m5 17 4-4 3 3 3-3 4 4" />
                </svg>
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
                className="h-16 w-16 shrink-0 rounded-full border-4 border-bg-base bg-accent shadow-[0_0_20px_rgba(212,175,55,0.45),0_0_40px_rgba(212,175,55,0.2)] transition duration-fast ease-out hover:shadow-[0_0_28px_rgba(212,175,55,0.65)] active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
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
            <p className="text-center text-[11px] text-accent font-medium drop-shadow-sm">
              Photo limit reached for this guest session.
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
        <p className="text-sm text-text-muted">Starting camera…</p>
      </div>
    );
  }

  if (permission === "denied" || permission === "unsupported") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base px-4">
        <div className="max-w-sm rounded-xl border border-border bg-bg-elevated p-4 shadow-2xl">
          <p className="text-sm text-text-secondary leading-relaxed">
            {permission === "denied"
              ? "Camera access was not granted. You can still choose a photo below."
              : "Camera is not available in this browser. You can still choose a photo below."}
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

function PendingStatusBadge({ status }: { status: PendingPhoto["status"] }) {
  if (status === "pending") return null;
  const label =
    status === "uploading"
      ? "…"
      : status === "confirmed"
        ? "✓"
        : status === "error"
          ? "!"
          : status === "expired"
            ? "✕"
            : "";
  const bg =
    status === "uploading"
      ? "bg-text-muted"
      : status === "confirmed"
        ? "bg-success"
        : status === "error"
          ? "bg-error"
          : status === "expired"
            ? "bg-text-muted"
            : "bg-bg-surface";
  return (
    <span
      className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${bg} text-xs font-bold text-bg-base shadow-sm`}
      aria-hidden="true"
    >
      {label}
    </span>
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Focus trap (mirrors admin PreviewDialog): focus the first focusable on
  // open, cycle Tab/Shift+Tab inside the panel, Escape closes.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>("button:not([disabled])");
    (focusables[0] ?? panel).focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-overlay-title"
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-4 shadow-2xl">
        <h2 id="review-overlay-title" className="sr-only">Photo review</h2>
        <div className="aspect-[9/16] max-h-[60dvh] mx-auto overflow-hidden rounded-xl bg-bg-surface border border-border/60 shadow-inner">
          <img src={photo.previewUrl} alt="Photo review" className="h-full w-full object-contain" />
        </div>
        {photo.errorMessage && (
          <p role="alert" className="mt-3 text-sm text-error">
            {photo.errorMessage}
          </p>
        )}
        <p className="mt-3 text-xs text-text-muted text-center">
          Status:{" "}
          <span className="text-text-primary font-medium">
            {photo.status === "pending"
              ? "Not sent yet"
              : photo.status === "uploading"
                ? "Sending…"
                : photo.status === "confirmed"
                  ? "Saved"
                  : photo.status === "error"
                    ? "Not saved"
                    : photo.status === "expired"
                      ? "Not saved — session expired"
                      : photo.status}
          </span>
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-border px-4 text-xs font-semibold text-text-primary transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
          >
            Back
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="min-h-11 flex-1 rounded-xl bg-accent px-4 text-xs font-bold text-on-accent transition duration-fast hover:brightness-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Retake
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-11 flex-1 rounded-xl bg-error px-4 text-xs font-bold text-text-primary transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}