/**
 * Pure capture geometry for the 9:16 frame pipeline (UI_UX §4.4).
 *
 * Deterministic center cover-crop: every camera sensor ratio is mapped to the
 * fixed 1080×1920 output by scaling to cover and cropping the overflow,
 * centered. This matches the live viewfinder (`object-fit: cover`) so the
 * capture is WYSIWYG: photo and frame overlay always share one 9:16
 * composition; neither is letterboxed or stretched. No canvas types needed —
 * pure numbers so it stays trivially unit-testable.
 */

import { FRAME_OUTPUT } from "@/lib/frames";

export interface CoverCrop {
  /** Source rectangle to sample from the camera frame. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination box — always the fixed output size. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Compute the centered cover-crop from a source of `srcWidth × srcHeight`
 * into the fixed 1080×1920 output. Returns null when source dimensions are
 * not positive (e.g. video not ready), letting callers keep their existing
 * graceful no-capture path.
 */
export function computeCoverCrop(
  srcWidth: number,
  srcHeight: number,
): CoverCrop | null {
  const { width: dw, height: dh } = FRAME_OUTPUT;
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight)) return null;
  if (srcWidth <= 0 || srcHeight <= 0) return null;

  // Cover: the smaller scale factor of the two axes fills the output.
  const scale = Math.max(dw / srcWidth, dh / srcHeight);
  const sw = dw / scale;
  const sh = dh / scale;
  return {
    sx: (srcWidth - sw) / 2,
    sy: (srcHeight - sh) / 2,
    sw,
    sh,
    dx: 0,
    dy: 0,
    dw,
    dh,
  };
}
