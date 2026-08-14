/**
 * Pending-photos pure logic (T030 Phase 2).
 *
 * UI_UX §4.3: multi-capture + batch sync. These functions are framework-free
 * so the quota and sync semantics can be unit-tested without React.
 *
 * Key invariant: the server-confirmed accepted count is authoritative. The
 * local capture budget is a UX hint only (§4.3, §7).
 */

export const PHOTO_LIMIT = 5;

/** Per-item status in the pending buffer (UI_UX §4.3). */
export type PendingStatus = "pending" | "uploading" | "confirmed" | "error" | "expired";

export interface PendingPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  status: PendingStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface UsageState {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

/**
 * Local capture budget = 5 − (server-confirmed accepted) − (local pending+uploading).
 * Never negative. Never authoritative (§4.3 Capture budget).
 */
export function localBudgetRemaining(
  serverAccepted: number,
  pending: PendingPhoto[],
): number {
  const inFlight = pending.filter(
    (p) => p.status === "pending" || p.status === "uploading",
  ).length;
  return Math.max(0, PHOTO_LIMIT - serverAccepted - inFlight);
}

/** Items that count toward the server-confirmed accepted total. */
export function confirmedCount(pending: PendingPhoto[]): number {
  return pending.filter((p) => p.status === "confirmed").length;
}

/** Items ready to be uploaded by the sync loop. */
export function syncablePhotos(pending: PendingPhoto[]): PendingPhoto[] {
  return pending.filter((p) => p.status === "pending");
}

/** Whether the sync loop should stop (no more pending items). */
export function hasSyncable(pending: PendingPhoto[]): boolean {
  return syncablePhotos(pending).length > 0;
}

/** Whether any item is currently uploading (sync in progress). */
export function isSyncing(pending: PendingPhoto[]): boolean {
  return pending.some((p) => p.status === "uploading");
}

/**
 * Determine if the 401 error code means the session is expired/invalid.
 * Used to decide whether to abort sync and transition to expiry state.
 */
export function isSessionError(status: number, code?: string): boolean {
  return (
    status === 401 &&
    (code === "SESSION_EXPIRED" ||
      code === "SESSION_INVALID" ||
      code === "SESSION_REQUIRED")
  );
}

/**
 * Determine if the error means the event is closed — no retry.
 */
export function isEventClosedError(status: number, code?: string): boolean {
  return status === 422 && code === "EVENT_CLOSED";
}

/**
 * Determine if the error means the photo limit was reached.
 */
export function isPhotoLimitError(status: number, code?: string): boolean {
  return status === 409 && code === "PHOTO_LIMIT_REACHED";
}

/**
 * Determine if the error is rate-limiting (should pause + honor Retry-After).
 */
export function isRateLimited(status: number, code?: string): boolean {
  return status === 429 && code === "RATE_LIMITED";
}

/**
 * Map a server error code to a user-facing message for a photo item.
 */
export function photoErrorMessage(code?: string): string {
  switch (code) {
    case "UNSUPPORTED_MEDIA":
      return "This image format is not supported. Choose another photo.";
    case "FILE_TOO_LARGE":
      return "This photo is too large. Choose a smaller file.";
    case "PHOTO_LIMIT_REACHED":
      return "Photo limit reached for this guest session.";
    case "EVENT_CLOSED":
      return "This event is closed. New submissions are not accepted.";
    case "RATE_LIMITED":
      return "Too many requests. Wait, then try again deliberately.";
    case "MEDIA_PERSISTENCE_FAILED":
      return "The photo was not confirmed as saved. Try again.";
    case "SESSION_EXPIRED":
    case "SESSION_INVALID":
    case "SESSION_REQUIRED":
      return "Your session is no longer valid.";
    default:
      return "The photo could not be uploaded. Check your connection, then try again.";
  }
}

let idCounter = 0;

/** Generate a unique local ID for a pending photo (not a DB ID). */
export function nextPendingId(): string {
  idCounter += 1;
  return `pending-${Date.now()}-${idCounter}`;
}
