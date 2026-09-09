/**
 * Frame registry for the guest photo capture flow.
 *
 * Frames are static PNG overlays under /public/frames. Selection is a
 * client-side UX concern only; uploads still use the existing single-photo
 * endpoint unchanged.
 *
 * Asset standard (owner decision, 2026-08-17): every frame asset is
 * 1080×1920 (9:16) PNG with a true alpha channel and a fully transparent
 * central photo area — no baked background and no baked photo content. Text
 * stamp removed (owner decision, 2026-08-29): no dynamic text layer since
 * then, so captured photos carry the frame artwork only.
 */

/**
 * Single enforced capture/frame aspect ratio (9:16). All preview cards, the
 * viewfinder, and the composited output derive from this — there is no
 * per-frame aspect metadata.
 */
export const FRAME_ASPECT_RATIO = 9 / 16;

/** Fixed composited output size for every camera capture. */
export const FRAME_OUTPUT = { width: 1080, height: 1920 } as const;

export interface Frame {
  id: string;
  label: string;
  src: string;
}

export const FRAMES: Frame[] = [
  {
    id: "none",
    label: "No Frame",
    src: "",
  },
  // Baked-in typography asset (2026-08-21); like every other frame it has no
  // dynamic text layer — the event-title stamp was removed (owner decision
  // 2026-08-29).
  {
    id: "wedding-crimson",
    label: "Wedding Crimson",
    src: "/frames/wedding-crimson.png",
  },
  {
    id: "flower",
    label: "Flower",
    src: "/frames/flower.png",
  },
  {
    id: "new",
    label: "New",
    src: "/frames/new.png",
  },
  {
    id: "clean",
    label: "Clean",
    src: "/frames/clean.png",
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
