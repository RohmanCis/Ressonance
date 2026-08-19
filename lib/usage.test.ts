import { describe, expect, it } from "vitest";
import { applyUsageDelta, type Usage, type UsageDelta } from "@/lib/usage";

// Compile-time check: a delta is assignable into every field it overlaps,
// and a full usage body can be composed from Usage + the delta fields.
const _usageFields: (keyof Usage)[] = [
  "photos_submitted",
  "photos_remaining",
  "voice_note_submitted",
  "voice_note_available",
  "guest_message_submitted",
  "guest_message_available",
];
const _deltaFields: (keyof UsageDelta)[] = [
  "photos_submitted",
  "photos_remaining",
  "voice_note_submitted",
  "voice_note_available",
];
_deltaFields.forEach((field) => {
  const check: keyof Usage = field;
  void check;
});

describe("applyUsageDelta", () => {
  it("preserves guest_message_* when overlaying a delta", () => {
    const usage: Usage = {
      photos_submitted: 2,
      photos_remaining: 3,
      voice_note_submitted: false,
      voice_note_available: true,
      guest_message_submitted: true,
      guest_message_available: false,
    };
    const delta: UsageDelta = {
      photos_submitted: 3,
      photos_remaining: 2,
      voice_note_submitted: false,
      voice_note_available: true,
    };
    expect(applyUsageDelta(usage, delta)).toEqual({
      photos_submitted: 3,
      photos_remaining: 2,
      voice_note_submitted: false,
      voice_note_available: true,
      guest_message_submitted: true,
      guest_message_available: false,
    });
  });

  it("overrides the 4 delta fields", () => {
    const usage: Usage = {
      photos_submitted: 0,
      photos_remaining: 5,
      voice_note_submitted: false,
      voice_note_available: true,
      guest_message_submitted: false,
      guest_message_available: true,
    };
    const delta: UsageDelta = {
      photos_submitted: 5,
      photos_remaining: 0,
      voice_note_submitted: true,
      voice_note_available: false,
    };
    const merged = applyUsageDelta(usage, delta);
    expect(merged.photos_submitted).toBe(5);
    expect(merged.photos_remaining).toBe(0);
    expect(merged.voice_note_submitted).toBe(true);
    expect(merged.voice_note_available).toBe(false);
  });

  it("does not mutate the input usage object", () => {
    const usage: Usage = {
      photos_submitted: 1,
      photos_remaining: 4,
      voice_note_submitted: false,
      voice_note_available: true,
      guest_message_submitted: true,
      guest_message_available: false,
    };
    const delta: UsageDelta = {
      photos_submitted: 2,
      photos_remaining: 3,
      voice_note_submitted: false,
      voice_note_available: true,
    };
    applyUsageDelta(usage, delta);
    expect(usage.photos_submitted).toBe(1);
    expect(usage.guest_message_submitted).toBe(true);
  });
});
