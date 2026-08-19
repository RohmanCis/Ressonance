import { ChangeEvent, useEffect, useRef } from "react";
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
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const closed = event.status === "CLOSED";
  const serverAccepted = session.photos_submitted;
  const budgetRemaining = localBudgetRemaining(serverAccepted, pendingPhotos);
  const showPreExpiryWarning =
    secondsLeft !== null && secondsLeft <= PRE_EXPIRY_WARN_SECONDS && secondsLeft > 0;
  // Manual advance: something captured locally, or the budget is already
  // consumed by server-confirmed photos from this session.
  const canAdvance = pendingPhotos.length > 0 || budgetRemaining === 0;

  return (
    <main className="bg-background text-foreground">
      {/* Fullscreen camera layer (minus safe areas) */}
      <section
        aria-labelledby="capture-heading"
        className="relative flex h-dvh flex-col bg-foreground text-background"
      >
        <h2 id="capture-heading" ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Take photos
        </h2>

        {/* Compact top bar: event title + guest name (UI_UX §4.3) */}
        <div className="shrink-0 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <p className="truncate font-display text-lg font-semibold leading-snug">{event.title}</p>
          <p className="truncate text-xs text-background/80">
            Guest: <span className="font-medium">{session.guest_name || "Anonymous Guest"}</span>
          </p>
        </div>

        {/* Status banners */}
        {(closed || showPreExpiryWarning) && (
          <div className="shrink-0 space-y-2 px-4 pb-2">
            {closed && (
              <div
                role="alert"
                className="rounded-[var(--radius)] border bg-card p-3 text-card-foreground shadow-[var(--shadow-1)]"
              >
                <p className="text-sm font-medium">Event closed</p>
                <p className="text-sm text-muted-foreground">
                  Your session remains viewable, but new submissions are not accepted.
                </p>
              </div>
            )}
            {showPreExpiryWarning && (
              <div
                role="status"
                className="rounded-[var(--radius)] border border-warning/40 bg-warning-surface p-3 shadow-[var(--shadow-1)]"
              >
                <p className="text-sm font-medium text-warning-foreground">
                  Your session ends in {Math.ceil(secondsLeft! / 60)} minute
                  {Math.ceil(secondsLeft! / 60) > 1 ? "s" : ""}. Send your photos to save them.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 9:16 viewfinder stage (UI_UX §4.4 WYSIWYG; letterboxed in the fullscreen layer) */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <CameraViewfinder camera={camera} frameOverlaySrc={selectedFrame?.src} />
        </div>

        {/* Bottom action band (thumb zone, safe-area clearance) */}
        <div className="shrink-0 space-y-2 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Pending photo strip */}
          {pendingPhotos.length > 0 && (
            <PendingStrip photos={pendingPhotos} onReview={onReviewPhoto} onRetry={onRetryPhoto} />
          )}

          {/* Manual advance to photo review */}
          {canAdvance && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={closed}
              className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
            >
              Lanjut →
            </button>
          )}

          {/* Shutter + remaining counter (bottom-right) */}
          <div className="flex items-end gap-3">
            <div className="min-w-16 flex-1" aria-hidden="true" />
            <button
              type="button"
              onClick={onShutter}
              disabled={closed || budgetRemaining <= 0 || camera.permission !== "granted"}
              className="h-16 w-16 shrink-0 rounded-full border-4 border-background bg-primary shadow-[var(--shadow-2)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Take photo"
            />
            <div className="min-w-16 flex-1 text-right">
              <p
                className="text-xs font-medium tabular-nums text-background/80"
                aria-live="polite"
              >
                {budgetRemaining} photo{budgetRemaining !== 1 ? "s" : ""} remaining
              </p>
            </div>
          </div>

          {/* File picker fallback */}
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-secondary px-4 text-sm font-semibold text-secondary-foreground focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
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

      {/* Below the camera layer: limit note, usage, session status */}
      <div className="px-5 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-xl space-y-6">
          {budgetRemaining <= 0 && !closed && (
            <p className="text-sm text-muted-foreground">
              Photo limit reached for this guest session.
            </p>
          )}

          {/* Usage panel */}
          <section
            aria-labelledby="usage-heading"
            className="rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]"
          >
            <h2 id="usage-heading" className="font-display text-xl font-semibold">
              Your session
            </h2>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <p className="rounded-md bg-muted px-3 py-3 tabular-nums">
                Photos remaining: <strong>{session.photos_remaining}/5</strong>
              </p>
              <p className="rounded-md bg-muted px-3 py-3">
                Voice note:{" "}
                <strong>{session.voice_note_available ? "Available" : "Already added"}</strong>
              </p>
            </div>
          </section>

          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        </div>
      </div>

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
  const { stream, permission, cameraCount, switchCamera } = camera;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (permission === "idle" || permission === "requesting") {
    return (
      <div className="flex aspect-[9/16] h-full max-w-full items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Starting camera…</p>
      </div>
    );
  }

  if (permission === "denied" || permission === "unsupported") {
    return (
      <div className="mx-4 max-w-sm rounded-[var(--radius)] border bg-card p-4 text-card-foreground shadow-[var(--shadow-1)]">
        <p className="text-sm text-muted-foreground">
          {permission === "denied"
            ? "Camera access was not granted. You can still choose a photo below."
            : "Camera is not available in this browser. You can still choose a photo below."}
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden bg-foreground">
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
      {cameraCount >= 2 && (
        <button
          type="button"
          onClick={switchCamera}
          className="absolute right-3 top-3 min-h-12 min-w-12 rounded-full bg-background/80 px-3 font-semibold text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Switch camera"
        >
          ↻
        </button>
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
    <div className="flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Captured photos">
      {photos.map((photo, index) => (
        <div key={photo.id} role="listitem" className="relative shrink-0">
          <button
            type="button"
            onClick={() => onReview(index)}
            className="block h-12 w-12 overflow-hidden rounded-md border bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Photo ${index + 1}, ${photo.status}`}
          >
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
          <PendingStatusBadge status={photo.status} />
          {photo.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(photo.id)}
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-destructive text-xs font-bold text-destructive-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
      ? "bg-muted-foreground"
      : status === "confirmed"
        ? "bg-success"
        : status === "error"
          ? "bg-destructive"
          : status === "expired"
            ? "bg-warning"
            : "bg-muted";
  return (
    <span
      className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${bg} text-xs font-bold text-background`}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4"
      role="dialog"
      aria-label="Photo review"
    >
      <div className="relative w-full max-w-md rounded-[var(--radius)] bg-card p-4 shadow-[var(--shadow-2)]">
        <div className="aspect-square overflow-hidden rounded-md bg-muted">
          <img src={photo.previewUrl} alt="Photo review" className="h-full w-full object-cover" />
        </div>
        {photo.errorMessage && (
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {photo.errorMessage}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
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
            className="min-h-12 flex-1 rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="min-h-12 flex-1 rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Retake
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 flex-1 rounded-md bg-destructive px-4 font-semibold text-destructive-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
