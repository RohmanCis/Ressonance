/**
 * Frame registry for the guest photo capture flow.
 *
 * Frames are static PNG overlays under /public/frames composited onto the
 * captured JPEG at shutter time. Selection is a client-side UX concern only;
 * uploads still use the existing single-photo endpoint unchanged.
 */

export interface Frame {
  id: string;
  label: string;
  src: string;
  aspectRatio: "3/4" | "1/1" | "9/16";
}

export const FRAMES: Frame[] = [
  { id: "none", label: "No Frame", src: "", aspectRatio: "3/4" },
  { id: "wedding-floral", label: "Wedding Floral", src: "/frames/wedding-floral.png", aspectRatio: "3/4" },
  { id: "wedding-simple", label: "Wedding Classic", src: "/frames/wedding-simple.png", aspectRatio: "3/4" },
  { id: "party", label: "Party", src: "/frames/party.png", aspectRatio: "3/4" },
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
