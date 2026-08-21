/**
 * Pure capture geometry + dynamic text-layer compositing for the 9:16 frame
 * pipeline (UI_UX §4.4; Hybrid Dynamic Frame Engine 2026-08-21).
 *
 * Deterministic center cover-crop: every camera sensor ratio is mapped to the
 * fixed 1080×1920 output by scaling to cover and cropping the overflow,
 * centered. This matches the live viewfinder (`object-fit: cover`) so the
 * capture is WYSIWYG: photo and frame overlay always share one 9:16
 * composition; neither is letterboxed or stretched.
 *
 * Text layers (bride & groom names) draw after the frame overlay, gated on
 * `document.fonts.ready` to prevent system-font fallback in the baked JPEG.
 */

import { FRAME_OUTPUT, type FrameTextLayer } from "@/lib/frames";

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
 * Resolve the canvas-usable font family for a layer. Canvas `ctx.font`
 * cannot use CSS var(), so read the next/font variable's computed value and
 * extract the generated family name. Falls back to the layer's generic
 * family when the variable is missing (SSR/pre-hydration/tests).
 */
export function resolveFontFamily(
  layer: Pick<FrameTextLayer, "fontVar" | "fallback">,
  css: Pick<CSSStyleDeclaration, "getPropertyValue">,
): string {
  const value = css.getPropertyValue(layer.fontVar).trim();
  if (!value) return layer.fallback;
  // Computed value is a double-quoted family list like
  // `"__Pinyon_Script_xx", "Pinyon Script"` — take the last entry so canvas
  // matches the CSS fallback chain.
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : layer.fallback;
}

/**
 * Build the canvas `ctx.font` shorthand for a layer. Kept pure for tests:
 * family is pre-resolved by the caller.
 */
export function fontShorthand(
  layer: Pick<FrameTextLayer, "fontStyle" | "fontWeight" | "sizePx" | "fallback">,
  family: string,
): string {
  const style = layer.fontStyle ?? "normal";
  const weight = layer.fontWeight ?? 400;
  return `${style} ${weight} ${layer.sizePx}px ${family}, ${layer.fallback}`;
}

export interface CompositeDynamicFrameOptions {
  ctx: CanvasRenderingContext2D;
  /** Decorative frame overlay asset; drawn full-canvas when provided. */
  frameImg?: HTMLImageElement | null;
  /** Dynamic text token source — currently only the event title. */
  eventTitle: string;
  layers: FrameTextLayer[];
}

/**
 * Draw the dynamic frame layers onto the composited 1080×1920 canvas:
 * frame overlay first, then each text layer centered horizontally at its
 * anchor. Assumes the caller already drew the (cover-cropped) photo and
 * gated on document.fonts.ready.
 */
export function compositeDynamicFrame({
  ctx,
  frameImg,
  eventTitle,
  layers,
}: CompositeDynamicFrameOptions): void {
  const { width, height } = FRAME_OUTPUT;

  if (frameImg) {
    ctx.drawImage(frameImg, 0, 0, width, height);
  }

  const text = eventTitle.trim();
  if (!text) return;

  const css = getComputedStyle(document.documentElement);
  const previousAlign = ctx.textAlign;
  const previousBaseline = ctx.textBaseline;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const layer of layers) {
    const family = resolveFontFamily(layer, css);
    ctx.font = fontShorthand(layer, family);
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${layer.letterSpacingPx ?? 0}px`;
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(
      layer.uppercase ? text.toUpperCase() : text,
      width / 2,
      layer.yRatio * height,
    );
  }

  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  }
  ctx.textAlign = previousAlign;
  ctx.textBaseline = previousBaseline;
}
