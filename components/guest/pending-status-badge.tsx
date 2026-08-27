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
 * Status → dot color for the full-text review pill (ReviewOverlay). Single
 * home for the status→visual mapping; pending/uploading read as active accent,
 * error/expired as error, confirmed shares the accent of the confirmed badge.
 */
export function statusPillDotClass(status: PendingPhoto["status"]): string {
  return status === "confirmed" || status === "uploading"
    ? "bg-accent"
    : status === "error" || status === "expired"
      ? "bg-error"
      : "bg-text-muted";
}

/** Status → full-text label for the review pill (strings verbatim, e2e locked). */
export function statusPillLabel(status: PendingPhoto["status"]): string {
  switch (status) {
    case "pending":
      return "Belum terkirim";
    case "uploading":
      return "Ngirim…";
    case "confirmed":
      return "Tersimpan";
    case "error":
      return "Belum tersimpan";
    case "expired":
      return "Belum tersimpan — sesi habis";
    default:
      return status;
  }
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
