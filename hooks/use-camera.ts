"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useCamera — getUserMedia lifecycle, capture-to-blob, camera switch, cleanup.
 *
 * UI_UX §4.3.1-§4.3.3, UI_DESIGN §11: camera-first viewfinder surface.
 * Stops all tracks on unmount/cancel to prevent battery drain + dangling LED.
 * Falls back gracefully: denied/unsupported → permission state for file-picker.
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
  capture: () => Promise<Blob | null>;
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

  const capture = useCallback(async (): Promise<Blob | null> => {
    const s = streamRef.current;
    if (!s) return null;
    const track = s.getVideoTracks()[0];
    if (!track) return null;

    const video = document.createElement("video");
    video.srcObject = s;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (facingModeRef.current === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
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
