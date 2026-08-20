/**
 * Usage state types (API Contract §4, §6.4, §6.5).
 *
 * `Usage` is the full 4-field session shape returned by GET session (§4).
 * `UsageDelta` is the 4-field subset carried by photo/voice 201 responses
 * (§6.4/§6.5).
 */

/** Full usage state — GET session shape (API Contract §4, 4 fields). */
export interface Usage {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

/** Partial usage carried by photo/voice 201 responses (API Contract §6.4/§6.5). */
export interface UsageDelta {
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
}

/** Overlay a sync-response delta onto full usage. */
export function applyUsageDelta(usage: Usage, delta: UsageDelta): Usage {
  return { ...usage, ...delta };
}
