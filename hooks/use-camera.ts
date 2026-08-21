"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAME_OUTPUT, type FrameTextLayer } from "@/lib/frames";
import { computeCoverCrop, compositeDynamicFrame } from "@/lib/frame-compositing";

/**
 * useCamera — getUserMedia lifecycle, capture-to-blob, camera switch, cleanup.
 *
 * UI_UX §4.3-§4.4, UI_DESIGN §11: camera-first viewfinder surface.
 * Stops all tracks on unmount/cancel to prevent battery drain + dangling LED.
 * Falls back gracefully: denied/unsupported → permission state for file-picker.
 *
 * Capture geometry (UI_UX §4.4): every photo is composited at the fixed
 * 1080×1920 (9:16) output via deterministic center cover-crop, matching the
 * live viewfinder so capture is WYSIWYG. The photo (never the frame overlay)
 * is mirrored for the front camera.
 */

export type CameraPermission = "idle" | "requesting" | "granted" | "denied" | "unsupported";

export interface UseCameraResult {
  stream: MediaStream | null;
  permission: CameraPermission;
  facingMode: "user" | "environment";
  cameraCount: number;
  start: () => Promise<void>;
  stop: () => void;
  switchCamera: () => Promise<void>;
  capture: (options?: CaptureOptions) => Promise<Blob | null>;
}

export interface CaptureOptions {
  frameImg?: HTMLImageElement | null;
  /** Dynamic text token — event title (bride & groom names). */
  eventTitle: string;
  layers: FrameTextLayer[];
}

export function useCamera(): UseCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermission>("idle");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [cameraCount, setCameraCount] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }
    cancelledRef.current = false;
    setPermission("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingModeRef.current } },
        audio: false,
      });
      if (cancelledRef.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = s;
      setStream(s);
      setPermission("granted");
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameraCount(devices.filter((d) => d.kind === "videoinput").length);
      } catch {
        setCameraCount(1);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      const name = (err as Error)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPermission("unsupported");
      } else {
        setPermission("denied");
      }
    }
  }, []);

  const switchCamera = useCallback(async () => {
    if (cameraCount < 2) return;
    stop();
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, [cameraCount, stop]);

  // Restart stream when facingMode changes (if it was running).
  useEffect(() => {
    if (permission === "granted" || permission === "requesting") {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const capture = useCallback(async (options?: CaptureOptions): Promise<Blob | null> => {
    const s = streamRef.current;
    if (!s) return null;
    const track = s.getVideoTracks()[0];
    if (!track) return null;

    const video = document.createElement("video");
    video.srcObject = s;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    // Deterministic center cover-crop into the fixed 9:16 output. A video
    // that reports zero dimensions (not ready) fails soft: no capture.
    const crop = computeCoverCrop(video.videoWidth, video.videoHeight);
    if (!crop) return null;

    const canvas = document.createElement("canvas");
    canvas.width = FRAME_OUTPUT.width;
    canvas.height = FRAME_OUTPUT.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Step 1: camera frame — mirror only the photo for the front camera.
    if (facingModeRef.current === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, crop.dx, crop.dy, crop.dw, crop.dh);

    // Step 2: reset transform so frame overlay + dynamic text are never mirrored.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Step 3: dynamic frame — overlay asset + event-title text layers.
    // Fonts are gated before drawing so the baked JPEG never falls back to
    // a system font (Hybrid Dynamic Frame Engine, 2026-08-21).
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // FontReady promise rejected — draw with whatever is loaded.
      }
    }
    compositeDynamicFrame({
      ctx,
      frameImg: options?.frameImg,
      eventTitle: options?.eventTitle ?? "",
      layers: options?.layers ?? [],
    });

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  }, []);

  return {
    stream,
    permission,
    facingMode,
    cameraCount,
    start,
    stop,
    switchCamera,
    capture,
  };
}
