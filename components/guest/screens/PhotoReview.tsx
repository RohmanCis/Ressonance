import { useEffect, useRef } from "react";
import { canDeletePhoto, type PendingPhoto } from "@/lib/pending-photos";
import { PendingStatusBadge } from "@/components/guest/pending-status-badge";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };

/**
 * PHOTO_REVIEW — sequential guest flow. Grid of captured photos with
 * per-item delete/retry; the primary CTA synchronizes pending items first
 * and advances to the Voice Note screen only once every remaining item is
 * server-confirmed (backend-authoritative, DESIGN.md §5.4–§5.5).
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
    <main className="flex min-h-dvh flex-col bg-bg-base text-text-primary">
      <header className="border-b border-border px-5 pb-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
        <p className="truncate text-xs font-medium tracking-[0.04em] text-text-muted">{event.title}</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight outline-none"
        >
          Foto kamu ({photos.length})
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hapus yang nggak diinginkan sebelum dikirim.
        </p>
      </header>

      <div className="flex-1 px-5 py-6 sm:px-8">
        {photos.length === 0 ? (
          <p className="text-sm text-text-muted">
            Tidak ada foto baru. Foto yang sudah terkirim tersimpan.
          </p>
        ) : (
          <section className="relative overflow-hidden rounded-2xl bg-bg-surface">
            <div className="relative p-4">
              <p className="font-mono text-xs tracking-widest text-text-muted">HASIL JEPRETAN</p>
              <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Captured photos">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className="relative animate-develop"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="aspect-square overflow-hidden rounded-lg border border-border bg-bg-surface">
                  <img
                    src={photo.previewUrl}
                    alt={`Photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-1 text-center font-mono text-xs tabular-nums text-text-muted">
                  Foto {index + 1}
                </p>
                <PendingStatusBadge status={photo.status} />
                {/* 44×44 hit area: invisible padded button, visual chip stays
                    28px anchored at the tile corner (AGENTS.md §6). The extra
                    16px extends into the tile's own non-interactive image and
                    the grid gap — never onto neighboring controls. */}
                <button
                  type="button"
                  onClick={() => onDeletePhoto(photo.id)}
                  disabled={!canDeletePhoto(photo.status)}
                  aria-label={`Delete photo ${index + 1}`}
                  className="group absolute -right-1 -top-1 flex h-11 w-11 items-start justify-end rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-error text-sm font-bold text-text-primary group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent"
                  >
                    ✕
                  </span>
                </button>
                {photo.status === "error" && (
                  <button
                    type="button"
                    onClick={() => onRetryPhoto(photo.id)}
                    aria-label={`Retry photo ${index + 1}: ${photo.errorMessage ?? "upload failed"}`}
                    className="group absolute -left-1 -top-1 flex h-11 w-11 items-start justify-start rounded-full focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg-elevated text-sm font-bold text-text-primary group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent"
                    >
                      ↻
                    </span>
                  </button>
                )}
              </li>
            ))}
              </ul>
            </div>
            {/* Analog grain over the review surface (texture only) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 film-grain" />
          </section>
        )}

        {hasErrors && (
          <p role="alert" className="mt-4 text-sm text-text-secondary">
            {errorCount} foto nggak tersimpan. Ulangi kirim atau hapus dulu sebelum lanjut.
          </p>
        )}
        {closed && !allConfirmed && (
          <p role="alert" className="mt-4 text-sm text-text-secondary">
            Acara ini sudah selesai. Kiriman baru nggak diterima lagi.
          </p>
        )}
      </div>

      <div className="space-y-2 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        {syncing && (
          <p role="status" className="text-center text-xs text-text-muted">
            Ngirim foto…
          </p>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={ctaDisabled}
          className="gold-foil-btn min-h-12 w-full rounded-lg px-4 font-semibold transition duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-45"
        >
          {syncing ? "Mengirim foto…" : "Kirim & Lanjut"}
        </button>
      </div>
    </main>
  );
}
