import { describe, expect, it } from "vitest";

import { deriveMetrics } from "./admin-dashboard";
import type { Submission } from "./admin-ui";

function submission(overrides: Partial<Submission>): Submission {
  return {
    id: "id",
    type: "PHOTO",
    guest_session_ref: "ref",
    created_at: "2026-08-30T10:00:00.000Z",
    mime_type: "image/jpeg",
    file_size: 1,
    ...overrides,
  };
}

// DESIGN.md §6: metrics strip is exactly 3 stats derived client-side from the
// loaded submissions — no "Media" total, no extra fetch.
describe("deriveMetrics", () => {
  it("counts distinct guest sessions, photos, and voice notes", () => {
    const items = [
      submission({ id: "1", guest_session_ref: "a" }),
      submission({ id: "2", guest_session_ref: "a" }),
      submission({ id: "3", guest_session_ref: "b", type: "VOICE_NOTE", mime_type: "audio/webm" }),
    ];
    expect(deriveMetrics(items)).toEqual({ guests: 2, photos: 2, voices: 1 });
  });

  it("zero-state renders identically (all zeros, same shape)", () => {
    expect(deriveMetrics([])).toEqual({ guests: 0, photos: 0, voices: 0 });
  });

  it("treats any non-PHOTO type as a voice note", () => {
    const items = [submission({ id: "1", type: "VOICE_NOTE" })];
    expect(deriveMetrics(items).voices).toBe(1);
  });
});
