import { describe, expect, it } from "vitest";
import {
  PHOTO_LIMIT,
  localBudgetRemaining,
  confirmedCount,
  syncablePhotos,
  hasSyncable,
  isSyncing,
  isSessionError,
  isEventClosedError,
  isPhotoLimitError,
  isRateLimited,
  canRetakePhoto,
  canDeletePhoto,
  parseRetryAfterSeconds,
  applySyncResult,
  photoErrorMessage,
  type PendingPhoto,
} from "@/lib/pending-photos";

function makePhoto(status: PendingPhoto["status"]): PendingPhoto {
  return { id: `id-${Math.random()}`, blob: new Blob(), previewUrl: "", status };
}

describe("pending-photos quota logic", () => {
  it("localBudgetRemaining = 5 - serverAccepted - inFlight", () => {
    expect(localBudgetRemaining(0, [])).toBe(5);
    expect(localBudgetRemaining(2, [makePhoto("pending"), makePhoto("uploading")])).toBe(1);
    expect(localBudgetRemaining(3, [makePhoto("pending"), makePhoto("uploading")])).toBe(0);
  });

  it("confirmed and errored items do not consume local budget", () => {
    expect(localBudgetRemaining(0, [makePhoto("confirmed")])).toBe(5);
    expect(localBudgetRemaining(0, [makePhoto("error")])).toBe(5);
    expect(localBudgetRemaining(0, [makePhoto("expired")])).toBe(5);
  });

  it("never goes negative", () => {
    expect(localBudgetRemaining(5, [makePhoto("pending")])).toBe(0);
    expect(localBudgetRemaining(4, [makePhoto("pending"), makePhoto("pending"), makePhoto("pending")])).toBe(0);
  });

  it("respects PHOTO_LIMIT constant", () => {
    expect(PHOTO_LIMIT).toBe(5);
  });
});

describe("pending-photos retake logic", () => {
  it("canRetakePhoto is true only for pending and error", () => {
    const statuses: PendingPhoto["status"][] = ["pending", "uploading", "confirmed", "error", "expired"];
    const expected = { pending: true, uploading: false, confirmed: false, error: true, expired: false };
    for (const status of statuses) {
      expect(canRetakePhoto(status)).toBe(expected[status]);
    }
  });

  it("retake budget invariant: remove one pending + add one pending leaves localBudgetRemaining unchanged", () => {
    const start = localBudgetRemaining(0, [makePhoto("pending"), makePhoto("pending")]);
    expect(start).toBe(3);
    // Remove the item being retaken → one slot freed.
    const afterRemove = localBudgetRemaining(0, [makePhoto("pending")]);
    expect(afterRemove).toBe(start + 1);
    // Replacement capture consumes it again → no net change.
    const afterRecapture = localBudgetRemaining(0, [makePhoto("pending"), makePhoto("pending")]);
    expect(afterRecapture).toBe(start);
  });
});

describe("pending-photos delete logic", () => {
  it("canDeletePhoto is true only for pending and error", () => {
    const statuses: PendingPhoto["status"][] = ["pending", "uploading", "confirmed", "error", "expired"];
    const expected = { pending: true, uploading: false, confirmed: false, error: true, expired: false };
    for (const status of statuses) {
      expect(canDeletePhoto(status)).toBe(expected[status]);
    }
  });
});

describe("pending-photos retry-after parsing", () => {
  it("uses finite positive numbers as-is", () => {
    expect(parseRetryAfterSeconds("15")).toBe(15);
    expect(parseRetryAfterSeconds("1.5")).toBe(1.5);
    expect(parseRetryAfterSeconds("99999")).toBe(99999);
  });

  it("falls back to 5 for missing, invalid, NaN, negative, zero, and garbage", () => {
    expect(parseRetryAfterSeconds(null)).toBe(5);
    expect(parseRetryAfterSeconds("")).toBe(5);
    expect(parseRetryAfterSeconds("abc")).toBe(5);
    expect(parseRetryAfterSeconds("NaN")).toBe(5);
    expect(parseRetryAfterSeconds("-3")).toBe(5);
    expect(parseRetryAfterSeconds("0")).toBe(5);
    expect(parseRetryAfterSeconds("12abc")).toBe(5);
    expect(parseRetryAfterSeconds("Infinity")).toBe(5);
    expect(parseRetryAfterSeconds("  ")).toBe(5);
  });
});

describe("pending-photos sync identity safety", () => {
  it("applySyncResult updates only the item with the matching id", () => {
    const a = makePhoto("pending"); a.id = "A";
    const b = makePhoto("pending"); b.id = "B";
    const after = applySyncResult([a, b], "A", { status: "confirmed" });
    expect(after.find((p) => p.id === "A")?.status).toBe("confirmed");
    expect(after.find((p) => p.id === "B")?.status).toBe("pending");
    expect(after).toHaveLength(2);
  });

  it("deleting another item mid-sync does not mislabel the in-flight result", () => {
    const a = makePhoto("uploading"); a.id = "A";
    const b = makePhoto("pending"); b.id = "B";
    // B is deleted (retaken) while A is uploading.
    const remaining = [a];
    const after = applySyncResult(remaining, "A", { status: "confirmed" });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: "A", status: "confirmed" });
  });

  it("applying a result for a removed id is a no-op — no wrong photo mislabeled", () => {
    const a = makePhoto("uploading"); a.id = "A";
    const b = makePhoto("pending"); b.id = "B";
    // A is deleted mid-flight; its upload result arrives late.
    const remaining = [b];
    const after = applySyncResult(remaining, "A", { status: "confirmed" });
    expect(after).toEqual([b]);
  });

  it("rate-limit reset to pending targets only the retried id", () => {
    const a = makePhoto("uploading"); a.id = "A";
    const b = makePhoto("pending"); b.id = "B";
    const after = applySyncResult([a, b], "A", { status: "pending" });
    expect(after.find((p) => p.id === "A")?.status).toBe("pending");
    expect(after.find((p) => p.id === "B")?.status).toBe("pending");
    expect(after).toHaveLength(2);
  });
});

describe("pending-photos sync helpers", () => {
  it("confirmedCount counts only confirmed", () => {
    expect(confirmedCount([makePhoto("pending"), makePhoto("confirmed"), makePhoto("error")])).toBe(1);
    expect(confirmedCount([])).toBe(0);
  });

  it("syncablePhotos returns only pending", () => {
    const photos = [makePhoto("pending"), makePhoto("uploading"), makePhoto("confirmed"), makePhoto("error"), makePhoto("expired")];
    expect(syncablePhotos(photos)).toHaveLength(1);
  });

  it("hasSyncable checks for pending items", () => {
    expect(hasSyncable([makePhoto("pending")])).toBe(true);
    expect(hasSyncable([makePhoto("uploading"), makePhoto("confirmed")])).toBe(false);
  });

  it("isSyncing checks for uploading items", () => {
    expect(isSyncing([makePhoto("uploading")])).toBe(true);
    expect(isSyncing([makePhoto("pending")])).toBe(false);
  });
});

describe("pending-photos error classification", () => {
  it("isSessionError detects 401 session codes", () => {
    expect(isSessionError(401, "SESSION_EXPIRED")).toBe(true);
    expect(isSessionError(401, "SESSION_INVALID")).toBe(true);
    expect(isSessionError(401, "SESSION_REQUIRED")).toBe(true);
    expect(isSessionError(401, "OTHER")).toBe(false);
    expect(isSessionError(403, "SESSION_EXPIRED")).toBe(false);
  });

  it("isEventClosedError detects 422 EVENT_CLOSED", () => {
    expect(isEventClosedError(422, "EVENT_CLOSED")).toBe(true);
    expect(isEventClosedError(422, "INVALID_INPUT")).toBe(false);
    expect(isEventClosedError(403, "EVENT_CLOSED")).toBe(false);
  });

  it("isPhotoLimitError detects 409 PHOTO_LIMIT_REACHED", () => {
    expect(isPhotoLimitError(409, "PHOTO_LIMIT_REACHED")).toBe(true);
    expect(isPhotoLimitError(422, "PHOTO_LIMIT_REACHED")).toBe(false);
  });

  it("isRateLimited detects 429 RATE_LIMITED", () => {
    expect(isRateLimited(429, "RATE_LIMITED")).toBe(true);
    expect(isRateLimited(429, "OTHER")).toBe(false);
  });
});

describe("pending-photos error messages", () => {
  it("maps known error codes to user-facing messages", () => {
    expect(photoErrorMessage("UNSUPPORTED_MEDIA")).toContain("not supported");
    expect(photoErrorMessage("FILE_TOO_LARGE")).toContain("too large");
    expect(photoErrorMessage("PHOTO_LIMIT_REACHED")).toContain("limit reached");
    expect(photoErrorMessage("EVENT_CLOSED")).toContain("closed");
    expect(photoErrorMessage("RATE_LIMITED")).toContain("Too many requests");
    expect(photoErrorMessage("MEDIA_PERSISTENCE_FAILED")).toContain("not confirmed as saved");
    expect(photoErrorMessage("SESSION_EXPIRED")).toContain("no longer valid");
  });

  it("returns generic message for unknown codes", () => {
    expect(photoErrorMessage("UNKNOWN_CODE")).toContain("could not be uploaded");
    expect(photoErrorMessage(undefined)).toContain("could not be uploaded");
  });
});
