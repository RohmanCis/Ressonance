import { useEffect, useRef } from "react";
import { canDeletePhoto, type PendingPhoto } from "@/lib/pending-photos";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };

/**
 * PHOTO_REVIEW — sequential guest flow (UI_UX §4.4 amendment).
 * Grid of captured photos with per-item delete/retry; the primary CTA
 * synchronizes pending items first and advances only once every remaining
 * item is server-confirmed (backend-authoritative).
 */
export function PhotoReview({
  event,
  photos,
  syncing,
  onDeletePhoto,
  onRetryPhoto,
  onNext,
}: {
  event: EventData;
  photos: PendingPhoto[];
  syncing: boolean;
  onDeletePhoto: (id: string) => void;
  onRetryPhoto: (id: string) => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const closed = event.status === "CLOSED";
  const hasPending = photos.some((p) => p.status === "pending");
  const hasErrors = photos.some((p) => p.status === "error");
  const allConfirmed = photos.every((p) => p.status === "confirmed");
  const errorCount = photos.filter((p) => p.status === "error").length;
  // Blocked while syncing, while unresolved errors remain with nothing left
  // to send, or while a closed event still holds unsent items.
  const ctaDisabled = syncing || (!allConfirmed && !hasPending) || (closed && !allConfirmed);

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
        <p className="truncate text-sm font-medium text-muted-foreground">{event.title}</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight outline-none"
        >
          Foto Anda ({photos.length})
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hapus yang tidak diinginkan sebelum dikirim.
        </p>
      </header>

      <div className="flex-1 px-5 py-6 sm:px-8">
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada foto baru. Foto yang sudah terkirim tersimpan.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2" aria-label="Captured photos">
            {photos.map((photo, index) => (
              <li key={photo.id} className="relative">
                <div className="aspect-square overflow-hidden rounded-md border bg-muted">
                  <img
                    src={photo.previewUrl}
                    alt={`Photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <StatusBadge status={photo.status} />
                <button
                  type="button"
                  onClick={() => onDeletePhoto(photo.id)}
                  disabled={!canDeletePhoto(photo.status)}
                  aria-label={`Delete photo ${index + 1}`}
                  className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-sm font-bold text-destructive-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span aria-hidden="true">✕</span>
                </button>
                {photo.status === "error" && (
                  <button
                    type="button"
                    onClick={() => onRetryPhoto(photo.id)}
                    aria-label={`Retry photo ${index + 1}: ${photo.errorMessage ?? "upload failed"}`}
                    className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span aria-hidden="true">↻</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {hasErrors && (
          <p role="alert" className="mt-4 text-sm text-muted-foreground">
            {errorCount} photo{errorCount > 1 ? "s" : ""} could not be saved. Retry or delete
            {errorCount > 1 ? " them" : " it"} before continuing.
          </p>
        )}
        {closed && !allConfirmed && (
          <p role="alert" className="mt-4 text-sm text-muted-foreground">
            This event is closed. New submissions are not accepted.
          </p>
        )}
      </div>

      <div className="space-y-2 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        {syncing && (
          <p role="status" className="text-center text-xs text-muted-foreground">
            Sending photos…
          </p>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={ctaDisabled}
          className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
        >
          {syncing ? "Mengirim foto…" : "Lanjut ke pesan suara"}
        </button>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: PendingPhoto["status"] }) {
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
