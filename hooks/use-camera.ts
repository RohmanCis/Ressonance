"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAME_OUTPUT } from "@/lib/frames";
import { computeCoverCrop, drawFrameOverlay } from "@/lib/frame-compositing";

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
}

export function useCamera(): UseCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermission>("idle");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [cameraCount, setCameraCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const isSwitchingRef = useRef(false);
  const switchDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  const stop = useCallback(() => {
    if (switchDelayTimer.current) {
      clearTimeout(switchDelayTimer.current);
      switchDelayTimer.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current && streamRef.current.active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      return;
    }

    cancelledRef.current = false;
    setPermission("requesting");

    try {
      // Minta resolusi Full-HD agar foto tidak buram saat di-crop ke 9:16 (1080x1920)
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingModeRef.current },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
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
    if (cameraCount < 2 || isSwitchingRef.current) return;
    isSwitchingRef.current = true;

    stop();

    // Beri buffer 150ms agar hardware camera release lock di level driver OS mobile
    await new Promise((r) => {
      switchDelayTimer.current = setTimeout(r, 150);
    });
    switchDelayTimer.current = null;

    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    isSwitchingRef.current = false;
  }, [cameraCount, stop]);

  useEffect(() => {
    if (permission === "granted" || permission === "requesting") {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (switchDelayTimer.current) {
        clearTimeout(switchDelayTimer.current);
        switchDelayTimer.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const capture = useCallback(async (options?: CaptureOptions): Promise<Blob | null> => {
    const s = streamRef.current;
    if (!s || !s.active) return null;
    const track = s.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return null;

    const video = document.createElement("video");
    video.srcObject = s;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();

      // Pastikan frame data dan dimensi video sudah terisi sebelum di-crop
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            video.onloadeddata = null;
            resolve(); // safety fallback
          }, 300);
          video.onloadeddata = () => {
            clearTimeout(timer);
            video.onloadeddata = null;
            resolve();
          };
        });
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        throw new Error("Invalid video dimensions");
      }

      const crop = computeCoverCrop(vw, vh);
      if (!crop) return null;

      const canvas = document.createElement("canvas");
      canvas.width = FRAME_OUTPUT.width;
      canvas.height = FRAME_OUTPUT.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Mirroring foto untuk kamera depan
      if (facingModeRef.current === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, crop.dx, crop.dy, crop.dw, crop.dh);

      // Reset transform matriks agar overlay frame TIDAK ikut termirror
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Render frame dekoratif di atas foto
      drawFrameOverlay(ctx, options?.frameImg);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
      });
    } catch {
      return null;
    } finally {
      // Mandatory memory cleanup: Lepaskan decoder WebKit agar iOS Safari tidak crash
      video.pause();
      video.srcObject = null;
      video.load();
      video.remove();
    }
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