/**
 * Frame registry + dynamic text-layer schema for the guest photo capture flow.
 *
 * Frames are static PNG overlays under /public/frames plus optional dynamic
 * text layers rendered onto the 1080×1920 canvas at shutter time. Selection
 * is a client-side UX concern only; uploads still use the existing
 * single-photo endpoint unchanged.
 *
 * Asset standard (owner decision, 2026-08-17): every frame asset is
 * 1080×1920 (9:16) PNG with a true alpha channel and a fully transparent
 * central photo area — no baked background, no baked photo content, and no
 * baked text: names are dynamic layers (Hybrid Dynamic Frame Engine,
 * 2026-08-21) so one asset serves any event title.
 */

/**
 * Single enforced capture/frame aspect ratio (9:16). All preview cards, the
 * viewfinder, and the composited output derive from this — there is no
 * per-frame aspect metadata.
 */
export const FRAME_ASPECT_RATIO = 9 / 16;

/** Fixed composited output size for every camera capture. */
export const FRAME_OUTPUT = { width: 1080, height: 1920 } as const;

/**
 * Dynamic text layer. Drawn on the composited canvas after the photo and the
 * frame overlay; the only dynamic token today is the event title (bride &
 * groom names). Fonts resolve from the next/font CSS variables declared in
 * app/layout.tsx — canvas cannot use var(), so the compositor resolves the
 * generated family name at draw time and falls back to a generic family if
 * the variable is unavailable (e.g. pre-hydration).
 */
export interface FrameTextLayer {
  text: "eventTitle";
  /** next/font CSS variable carrying the resolved family name. */
  fontVar: "--font-pinyon" | "--font-cormorant" | "--font-dm-mono";
  /** Generic canvas family used when the variable cannot be resolved. */
  fallback: "cursive" | "serif" | "monospace";
  fontStyle?: "normal" | "italic";
  fontWeight?: number;
  sizePx: number;
  /** Extra letter tracking in px (Chromium canvas `letterSpacing`). */
  letterSpacingPx?: number;
  /** Vertical anchor as a fraction of the 1920px output height (0..1). */
  yRatio: number;
  color: string;
  uppercase?: boolean;
}

export interface Frame {
  id: string;
  label: string;
  src: string;
  textLayers: FrameTextLayer[];
}

export const FRAMES: Frame[] = [
  {
    id: "none",
    label: "No Frame",
    src: "",
    textLayers: [],
  },
  {
    id: "royal-gold",
    label: "Royal Gold Serif",
    src: "/frames/royal-gold.png",
    textLayers: [
      {
        text: "eventTitle",
        fontVar: "--font-cormorant",
        fallback: "serif",
        fontStyle: "italic",
        fontWeight: 500,
        sizePx: 96,
        yRatio: 0.875,
        color: "#d4af37",
      },
    ],
  },
  {
    id: "botanical-romance",
    label: "Botanical Romance",
    src: "/frames/botanical-romance.png",
    textLayers: [
      {
        text: "eventTitle",
        fontVar: "--font-pinyon",
        fallback: "cursive",
        fontWeight: 400,
        sizePx: 124,
        yRatio: 0.845,
        color: "#f7f2ea",
      },
    ],
  },
  {
    id: "modern-editorial",
    label: "Modern Editorial",
    src: "/frames/modern-editorial.png",
    textLayers: [
      {
        text: "eventTitle",
        fontVar: "--font-dm-mono",
        fallback: "monospace",
        fontWeight: 500,
        sizePx: 58,
        letterSpacingPx: 16,
        yRatio: 0.865,
        color: "#f7f2ea",
        uppercase: true,
      },
    ],
  },
  // Owner-approved exception (2026-08-21): baked-in typography asset —
  // no dynamic text layers, otherwise the event title renders twice.
  {
    id: "wedding-crimson",
    label: "Wedding Crimson",
    src: "/frames/wedding-crimson.png",
    textLayers: [],
  },
  {
    id: "flower",
    label: "Flower",
    src: "/frames/flower.png",
    textLayers: [
      {
        text: "eventTitle",
        fontVar: "--font-pinyon",
        fallback: "cursive",
        fontWeight: 400,
        sizePx: 118,
        yRatio: 0.85,
        color: "#f7f2ea",
      },
    ],
  },
];

export const DEFAULT_FRAME_ID = "none";

export function loadFrameImage(frame: Frame): Promise<HTMLImageElement | null> {
  if (!frame.src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // fail gracefully, photo uploads without frame
    img.src = frame.src;
  });
}
