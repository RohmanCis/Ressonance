import type { PendingPhoto } from "@/lib/pending-photos";

/**
 * Shared pending-photo status badge (aria-hidden overlay chip) used by the
 * Capture pending strip and the Photo Review grid. One definition — the two
 * screens previously carried verbatim duplicates.
 */
export function PendingStatusBadge({ status }: { status: PendingPhoto["status"] }) {
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

/**
 * Uploading ring overlaid on a photo thumbnail (DESIGN.md §5.3 per-item
 * "uploading spinner"). Render inside the thumbnail's relative image
 * container. Transform-only motion; reduced-motion zeroes it via the
 * global media query. Gold segment matches the ReviewOverlay uploading dot
 * (active-state accent, §2).
 */
export function PendingUploadingRing() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-base/40"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-text-primary/25 border-t-accent" />
    </span>
  );
}
