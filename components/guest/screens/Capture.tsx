import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
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
 * CAPTURE — fullscreen camera hero (DESIGN.md §5.3). The viewfinder fills the
 * viewport (100dvh minus safe areas); the selected frame overlays it
 * unmirrored exactly as composited (WYSIWYG 1080×1920). Gold is reserved for
 * the shutter and the advance action; the DM Mono counter ticks like a film
 * frame counter. The mic trigger opens the voice recorder slide-up panel —
 * it never blocks capture while closed.
 */
export function Capture({
  event,
  session,
  pendingPhotos,
  secondsLeft,
  message,
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
  onOpenVoicePanel,
}: {
  event: EventData;
  session: SessionData;
  pendingPhotos: PendingPhoto[];
  secondsLeft: number | null;
  message: string;
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
  onOpenVoicePanel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Shutter press flash (§4: 150ms scale handled by active:, plus a brief
  // opacity flash overlay).
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
  // Manual advance: something captured locally, or the budget is already
  // consumed by server-confirmed photos from this session.
  const canAdvance = pendingPhotos.length > 0 || budgetRemaining === 0;

  function handleShutter() {
    if (shutterDisabled) return;
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 150);
    onShutter();
  }

  return (
    <main className="bg-bg-base text-text-primary">
      {/* Fullscreen camera layer (minus safe areas) */}
      <section
        aria-labelledby="capture-heading"
        className="relative h-dvh overflow-hidden"
      >
        <h2 id="capture-heading" ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Take photos
        </h2>

        {/* Viewfinder hero — full viewport */}
        <CameraViewfinder camera={camera} frameOverlaySrc={selectedFrame?.src} />

        {/* Shutter flash overlay (opacity only, --motion-fast) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-text-primary transition-opacity duration-fast ${
            flash ? "opacity-40" : "opacity-0"
          }`}
        />

        {/* Translucent top bar: event title + guest name + counter/camera row */}
        <div className="absolute inset-x-0 top-0 bg-overlay px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <p className="truncate font-display text-lg font-semibold leading-snug">{event.title}</p>
          <p className="truncate text-xs text-text-secondary">
            Guest: <span className="font-medium text-text-primary">{session.guest_name || "Anonymous Guest"}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-h-11 min-w-11">
              {camera.cameraCount >= 2 && (
                <button
                  type="button"
                  onClick={camera.switchCamera}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-overlay px-3 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Switch camera"
                >
                  ↻
                </button>
              )}
            </div>
            {/* DM Mono frame counter (local budget hint; server is authoritative) */}
            <p
              className="rounded-full bg-overlay px-3 py-1.5 font-mono text-xs tabular-nums text-text-primary"
              aria-live="polite"
              aria-label={`${budgetRemaining} of ${totalBudget} photos remaining`}
            >
              {budgetRemaining} / {totalBudget}
            </p>
          </div>
        </div>

        {/* Status banners */}
        {(closed || showPreExpiryWarning) && (
          <div className="absolute inset-x-4 top-[calc(7.5rem+env(safe-area-inset-top))] space-y-2">
            {closed && (
              <div
                role="alert"
                className="rounded-lg border border-border bg-bg-elevated p-3"
              >
                <p className="text-sm font-medium">Event closed</p>
                <p className="text-sm text-text-secondary">
                  Your session remains viewable, but new submissions are not accepted.
                </p>
              </div>
            )}
            {showPreExpiryWarning && (
              <div
                role="status"
                className="rounded-lg border border-border bg-bg-elevated p-3"
              >
                <p className="text-sm font-medium">
                  Your session ends in {Math.ceil(secondsLeft! / 60)} minute
                  {Math.ceil(secondsLeft! / 60) > 1 ? "s" : ""}. Send your photos to save them.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bottom action band (thumb zone, safe-area clearance) */}
        <div className="absolute inset-x-0 bottom-0 space-y-3 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {message && !closed && (
            <p role="status" className="text-center text-xs text-text-secondary">
              {message}
            </p>
          )}

          {/* Pending photo strip (~48px thumbnails above the shutter) */}
          {pendingPhotos.length > 0 && (
            <PendingStrip photos={pendingPhotos} onReview={onReviewPhoto} onRetry={onRetryPhoto} />
          )}

          {/* Manual advance to photo review */}
          {canAdvance && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={closed}
              className="min-h-12 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              Lanjut →
            </button>
          )}

          {/* Shutter + voice-note trigger */}
          <div className="flex items-end gap-3">
            <div className="min-w-16 flex-1" aria-hidden="true" />
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleShutter}
                disabled={shutterDisabled}
                className="h-18 w-18 shrink-0 rounded-full border-4 border-bg-base bg-accent transition-transform duration-fast ease-out active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Take photo"
              />
              {budgetRemaining <= 0 && !closed && (
                <p className="max-w-40 text-center text-xs text-text-secondary">
                  Photo limit reached for this guest session.
                </p>
              )}
            </div>
            <div className="min-w-16 flex-1">
              {session.voice_note_available && (
                <button
                  type="button"
                  onClick={onOpenVoicePanel}
                  disabled={closed}
                  className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-lg text-text-primary transition-opacity duration-fast hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Mic className="h-6 w-6" aria-hidden="true" />
                  <span className="text-[0.625rem] font-medium tracking-[0.04em]">Voice note</span>
                </button>
              )}
            </div>
          </div>

          {/* File picker fallback */}
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            <span>Choose a photo</span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={onFileSelect}
              disabled={closed || budgetRemaining <= 0}
            />
          </label>
        </div>
      </section>

      {/* Review overlay */}
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
        <div className="max-w-sm rounded-lg border border-border bg-bg-elevated p-4">
          <p className="text-sm text-text-secondary">
            {permission === "denied"
              ? "Camera access was not granted. You can still choose a photo below."
              : "Camera is not available in this browser. You can still choose a photo below."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-bg-base">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        aria-label="Camera preview"
      />
      {frameOverlaySrc && (
        <img
          src={frameOverlaySrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
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
    <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Captured photos">
      {photos.map((photo, index) => (
        <div key={photo.id} role="listitem" className="relative shrink-0">
          <button
            type="button"
            onClick={() => onReview(index)}
            className="block h-12 w-12 overflow-hidden rounded-md border border-border bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Photo ${index + 1}, ${photo.status}`}
          >
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
          <PendingStatusBadge status={photo.status} />
          {photo.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(photo.id)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-xs font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Retry upload"
            >
              ↻
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
      className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${bg} text-xs font-bold text-bg-base`}
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-label="Photo review"
    >
      <div className="relative w-full max-w-md rounded-xl border border-border bg-bg-elevated p-4">
        <div className="aspect-square overflow-hidden rounded-lg bg-bg-surface">
          <img src={photo.previewUrl} alt="Photo review" className="h-full w-full object-cover" />
        </div>
        {photo.errorMessage && (
          <p role="alert" className="mt-3 text-sm text-text-secondary">
            {photo.errorMessage}
          </p>
        )}
        <p className="mt-3 text-sm text-text-muted">
          Status:{" "}
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
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-lg border border-border px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="min-h-12 flex-1 rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Retake
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 flex-1 rounded-lg bg-error px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
