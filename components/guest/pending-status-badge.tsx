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
