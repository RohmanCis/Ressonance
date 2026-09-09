/**
 * Capture geometry + frame-overlay compositing for the 9:16 photo pipeline.
 *
 * Deterministic center cover-crop: every camera sensor ratio is mapped to the
 * fixed 1080×1920 output by scaling to cover and cropping the overflow,
 * centered. This matches the live viewfinder (`object-fit: cover`) so the
 * capture is WYSIWYG: photo and frame overlay always share one 9:16
 * composition; neither is letterboxed or stretched.
 *
 * The composited output is the cover-cropped photo plus the selected frame
 * overlay drawn full-canvas. No dynamic text is drawn — the event-title
 * stamp was removed (owner decision 2026-08-29).
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

/**
 * Draw the frame overlay full-canvas onto the composited 1080×1920 output.
 * Assumes the caller already drew the cover-cropped photo. No-op when no
 * overlay is selected or its image failed to load.
 */
export function drawFrameOverlay(
  ctx: CanvasRenderingContext2D,
  frameImg?: HTMLImageElement | null,
): void {
  if (!frameImg) return;
  ctx.drawImage(frameImg, 0, 0, FRAME_OUTPUT.width, FRAME_OUTPUT.height);
}
