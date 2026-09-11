/**
 * Shared display formatters. Each function preserves its call site's exact
 * output — the m:ss and mm:ss variants are intentionally kept separate.
 */

/** Zero-pad a non-negative integer to 2 digits (minutes/seconds/time parts). */
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** m:ss with unpadded minutes, clamped at 0 — guest audio player elapsed/total. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** m:ss, empty string when the duration is missing — admin media tiles. */
export function formatDuration(seconds?: number | null): string {
  return seconds == null ? "" : formatTime(seconds);
}

/** mm:ss with zero-padded minutes — voice recording timer (integer seconds). */
export function formatTimer(seconds: number): string {
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
}
