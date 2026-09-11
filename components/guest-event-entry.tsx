"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/use-camera";
import { loadFrameImage, type Frame } from "@/lib/frames";
import { applyUsageDelta, type Usage, type UsageDelta } from "@/lib/usage";
import {
  applySyncResult,
  isEventClosedError,
  isPhotoLimitError,
  isRateLimited,
  isSessionError,
  localBudgetRemaining,
  nextPendingId,
  parseRetryAfterSeconds,
  photoErrorMessage,
  shouldRetryRateLimit,
  type PendingPhoto,
} from "@/lib/pending-photos";
import dynamic from "next/dynamic";
import { PreSession } from "@/components/guest/screens/PreSession";
import { FrameSelection } from "@/components/guest/screens/FrameSelection";
import { Done } from "@/components/guest/screens/Done";

const Capture = dynamic(() => import("@/components/guest/screens/Capture").then((m) => m.Capture));
const PhotoReview = dynamic(() => import("@/components/guest/screens/PhotoReview").then((m) => m.PhotoReview));
const VoiceRecordingScreen = dynamic(() => import("@/components/guest/screens/VoiceRecordingScreen").then((m) => m.VoiceRecordingScreen));

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };
type SessionData = Usage & { guest_name: string | null };
type ViewState =
  | "loading"
  | "ready"
  | "closed"
  | "not-found"
  | "starting"
  | "invalid"
  | "rate-limited"
  | "offline"
  | "unexpected"
  | "frame-select"
  | "post-session-loading"
  | "post-session"
  | "photo-review"
  | "voice-note"
  | "done";
type VoiceState = "idle" | "recording" | "review" | "submitting" | "success" | "error" | "review-error" | "unsupported";

const errorText = "Sesi gagal dimulai. Namamu masih tersimpan, coba lagi ya.";
const SESSION_MAX_SECONDS = 1800;
const SESSION_STATES: ViewState[] = ["post-session", "photo-review", "voice-note"];

export function GuestEventEntry({ publicId }: { publicId: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [name, setName] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [message, setMessage] = useState("");

  // Pending photos buffer
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);
  pendingPhotosRef.current = pendingPhotos;
  const prevPhotosCountRef = useRef(0);
  const [syncing, setSyncing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const captureErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewReturnFocusRef = useRef<HTMLElement | null>(null);
  const syncAbortedRef = useRef(false);
  const syncingRef = useRef(false);
  const advancePendingRef = useRef(false);

  // Expiry / carry-over
  const [expiredPending, setExpiredPending] = useState<PendingPhoto[]>([]);
  const expiredPendingRef = useRef<PendingPhoto[]>([]);
  expiredPendingRef.current = expiredPending;
  const [carryOverPrompt, setCarryOverPrompt] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Voice note state
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const voiceUrlRef = useRef("");
  voiceUrlRef.current = voiceUrl;
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceXhrRef = useRef<XMLHttpRequest | null>(null);
  const voiceSecondsRef = useRef(0);
  const voiceGeneration = useRef(0);

  const camera = useCamera();

  // Frame selection
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const frameConfirmingRef = useRef(false);

  // --- Event load ---
  useEffect(() => {
    let active = true;
    fetch(`/api/events/${encodeURIComponent(publicId)}`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) { setState("not-found"); return; }
        if (!response.ok) throw new Error("event");
        const body = (await response.json()) as { event?: EventData };
        if (!body.event?.title || !["ACTIVE", "CLOSED"].includes(body.event.status)) throw new Error("event");
        setEvent(body.event);
        setState(body.event.status === "CLOSED" ? "closed" : "ready");
      })
      .catch(() => {
        if (active) { setState("unexpected"); setMessage("Acara nggak bisa dimuat. Coba lagi ya."); }
      });
    return () => { active = false; };
  }, [publicId]);

  // --- Session expiry timer ---
  useEffect(() => {
    if (!SESSION_STATES.includes(state) || !sessionStartRef.current) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      if (!sessionStartRef.current) return;
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const remaining = SESSION_MAX_SECONDS - elapsed;
      setSecondsLeft(remaining > 0 ? remaining : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state]);

  // --- Start session ---
  async function start(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (startingRef.current) return;
    if (!event || (state !== "ready" && state !== "invalid" && state !== "rate-limited" && state !== "offline" && state !== "unexpected" && !carryOverPrompt)) return;
    startingRef.current = true;
    setState("starting");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(publicId)}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_name: name }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        session?: SessionData;
        error?: { code?: string; fields?: Record<string, string> };
      };
      if (response.status === 201 && body.session) {
        setSession(body.session);
        sessionStartRef.current = Date.now();
        setState("frame-select");
        setMessage("");
        startingRef.current = false;
        return;
      }
      const code = body.error?.code;
      if (response.status === 422 && code === "INVALID_INPUT") {
        setState("invalid");
        setMessage(body.error?.fields?.guest_name ?? "Nama belum valid — kosongin saja kalau nggak mau isi.");
      } else if (response.status === 429 && code === "RATE_LIMITED") {
        setState("rate-limited");
        const retryAfter = response.headers.get("Retry-After");
        setMessage(retryAfter ? `Mulai sesi lagi dibatasi sebentar. Coba lagi dalam ${retryAfter} detik.` : "Mulai sesi lagi dibatasi sebentar. Coba beberapa saat lagi.");
      } else if (code === "EVENT_CLOSED") {
        setState("closed");
        setMessage("Acara ini sudah selesai. Kiriman baru nggak diterima lagi.");
      } else {
        setState("unexpected");
        setMessage(errorText);
      }
      startingRef.current = false;
    } catch {
      startingRef.current = false;
      setState("offline");
      setMessage("Sesi belum berhasil dimulai. Cek koneksimu, lalu coba lagi.");
    }
  }

  async function confirmUsage(): Promise<boolean> {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(publicId)}/session`);
      const body = (await response.json().catch(() => ({}))) as { error?: { code?: string }; guest_name?: string | null; photos_submitted?: number; photos_remaining?: number; voice_note_submitted?: boolean; voice_note_available?: boolean; event?: { status?: EventData["status"] } };
      if (response.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(body.error?.code ?? "")) {
        handleSessionExpired();
        return false;
      }
      if (!response.ok || typeof body.photos_submitted !== "number" || typeof body.photos_remaining !== "number" || typeof body.voice_note_submitted !== "boolean" || typeof body.voice_note_available !== "boolean") throw new Error("usage");
      setSession({ guest_name: body.guest_name ?? null, photos_submitted: body.photos_submitted, photos_remaining: body.photos_remaining, voice_note_submitted: body.voice_note_submitted, voice_note_available: body.voice_note_available });
      if (body.event?.status === "CLOSED") {
        setEvent((current) => current ? { ...current, status: "CLOSED" } : current);
        setMessage("Acara ini sudah selesai. Kiriman baru nggak diterima lagi.");
      }
      return true;
    } catch {
      setMessage("Sesi belum bisa dicek. Cek koneksimu, lalu coba lagi.");
      return true;
    }
  }

  const handleFrameSelect = useCallback(async (frame: Frame) => {
    // Guard re-entrancy: repeated confirms must not run concurrent usage checks
    if (frameConfirmingRef.current) return;
    frameConfirmingRef.current = true;
    setSelectedFrame(frame);
    setState("post-session-loading");
    setMessage("Ngecek sesimu dulu…");
    const frameImg = frame.src ? await loadFrameImage(frame) : null;
    frameImgRef.current = frameImg;
    // Asset gagal dimuat → lanjut tanpa frame, jangan render <img> rusak
    if (frame.src && !frameImg) setSelectedFrame(null);
    const proceed = await confirmUsage();
    if (!proceed) {
      frameConfirmingRef.current = false;
      return;
    }
    if (carryOverPrompt && expiredPending.length > 0) {
      const carried = expiredPending.map((p) => ({
        ...p,
        status: "pending" as const,
        errorCode: undefined,
        errorMessage: undefined,
      }));
      setPendingPhotos(carried);
      setExpiredPending([]);
    }
    setCarryOverPrompt(false);
    frameConfirmingRef.current = false;
    setState("post-session");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, carryOverPrompt, expiredPending]);

  function handleSessionExpired() {
    const unsaved = pendingPhotosRef.current.filter((p) => p.status !== "confirmed");
    pendingPhotosRef.current
      .filter((p) => p.status === "confirmed")
      .forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    if (unsaved.length > 0) {
      setExpiredPending(unsaved.map((p) => ({ ...p, status: "expired" as const })));
    }
    setPendingPhotos([]);
    voiceXhrRef.current?.abort();
    voiceXhrRef.current = null;
    setSession(null);
    sessionStartRef.current = null;
    setSecondsLeft(null);
    setSyncing(false);
    syncAbortedRef.current = true;
    advancePendingRef.current = false;
    resetVoice();
    setState("ready");
    setCarryOverPrompt(unsaved.length > 0);
    setMessage(
      unsaved.length > 0
        ? `Sesi kamu sudah habis. ${unsaved.length} foto belum tersimpan. Tekan Mulai untuk mulai lagi.`
        : "Sesi kamu sudah habis. Tekan Mulai untuk mulai lagi.",
    );
  }

  function showCaptureError() {
    setCaptureError(true);
    if (captureErrorTimer.current) clearTimeout(captureErrorTimer.current);
    captureErrorTimer.current = setTimeout(() => {
      captureErrorTimer.current = null;
      setCaptureError(false);
    }, 3000);
  }

  async function handleCapture() {
    if (!session || event?.status === "CLOSED" || !event) return;
    let blob: Blob | null = null;
    try {
      blob = await camera.capture({ frameImg: frameImgRef.current });
    } catch {
      blob = null;
    }
    if (!blob) {
      showCaptureError();
      return;
    }
    setCaptureError(false);
    const photo: PendingPhoto = {
      id: nextPendingId(),
      blob,
      previewUrl: URL.createObjectURL(blob),
      status: "pending",
    };
    setPendingPhotos((prev) => [...prev, photo]);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!session || event?.status === "CLOSED") return;
    const photo: PendingPhoto = {
      id: nextPendingId(),
      blob: file,
      previewUrl: URL.createObjectURL(file),
      status: "pending",
    };
    setPendingPhotos((prev) => [...prev, photo]);
    e.target.value = "";
  }

  function removePhoto(id: string) {
    setPendingPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (!item || item.status === "uploading") return prev;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setReviewIndex(null);
  }

  function retryPhoto(id: string) {
    setPendingPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "pending", errorCode: undefined, errorMessage: undefined } : p)),
    );
  }

  const syncPhotos = useCallback(async () => {
    if (!session || syncing || syncingRef.current || event?.status === "CLOSED") return;
    syncingRef.current = true;
    syncAbortedRef.current = false;
    setSyncing(true);

    const ids = pendingPhotosRef.current
      .filter((p) => p.status === "pending")
      .map((p) => p.id);
    const rateLimitAttempts = new Map<string, number>();

    for (let i = 0; i < ids.length; i++) {
      if (syncAbortedRef.current) break;
      const itemId = ids[i];
      const item = pendingPhotosRef.current.find((p) => p.id === itemId);
      if (!item || item.status !== "pending") continue;

      setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "uploading" }));

      try {
        const formData = new FormData();
        formData.append("photo", item.blob, "photo.jpg");
        const response = await fetch(`/api/events/${encodeURIComponent(publicId)}/photos`, {
          method: "POST",
          body: formData,
        });
        const body = (await response.json().catch(() => ({}))) as {
          usage?: UsageDelta;
          error?: { code?: string };
        };

        if (response.status === 201 && body.usage) {
          setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "confirmed" }));
          setSession((prev) =>
            prev && body.usage
              ? { ...applyUsageDelta(prev, body.usage), guest_name: prev.guest_name }
              : prev,
          );
        } else {
          const code = body.error?.code;
          if (isSessionError(response.status, code)) {
            setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "pending" }));
            setSyncing(false);
            syncingRef.current = false;
            handleSessionExpired();
            return;
          }
          if (isEventClosedError(response.status, code)) {
            setPendingPhotos((prev) =>
              applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
            );
            break;
          }
          if (isPhotoLimitError(response.status, code)) {
            setPendingPhotos((prev) =>
              applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
            );
            break;
          }
          if (isRateLimited(response.status, code)) {
            const attempts = (rateLimitAttempts.get(itemId) ?? 0) + 1;
            rateLimitAttempts.set(itemId, attempts);
            if (!shouldRetryRateLimit(attempts)) {
              setPendingPhotos((prev) =>
                applySyncResult(prev, itemId, { status: "error", errorCode: "RATE_LIMITED", errorMessage: photoErrorMessage("RATE_LIMITED") }),
              );
              continue;
            }
            const retryAfter = parseRetryAfterSeconds(response.headers.get("Retry-After"));
            setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "pending" }));
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            i--;
            continue;
          }
          setPendingPhotos((prev) =>
            applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
          );
        }
      } catch {
        setPendingPhotos((prev) =>
          applySyncResult(prev, itemId, { status: "error", errorMessage: photoErrorMessage() }),
        );
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, syncing, event, publicId]);

  async function handleReviewNext() {
    if (syncing) return;
    if (pendingPhotosRef.current.some((p) => p.status === "pending")) {
      advancePendingRef.current = true;
      await syncPhotos();
      return;
    }
    if (pendingPhotosRef.current.every((p) => p.status === "confirmed")) {
      setState("voice-note");
    }
  }

  useEffect(() => {
    if (
      advancePendingRef.current &&
      !syncing &&
      pendingPhotosRef.current.every((p) => p.status === "confirmed")
    ) {
      advancePendingRef.current = false;
      setState("voice-note");
    }
  }, [syncing, pendingPhotos]);

  function stopVoiceTimer() {
    if (voiceTimer.current) {
      clearInterval(voiceTimer.current);
      voiceTimer.current = null;
    }
  }

  function finishRecording() {
    stopVoiceTimer();
    if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
  }

  async function recordVoice() {
    if (
      !session ||
      event?.status === "CLOSED" ||
      !session.voice_note_available ||
      voiceState === "recording" ||
      voiceState === "submitting"
    ) {
      return;
    }
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      setVoiceState("unsupported");
      setVoiceMessage("Rekaman suara nggak didukung di sini. Coba browser atau perangkat lain.");
      return;
    }
    setVoiceMessage("Browser bakal minta izin mikrofon. Rekamannya mulai setelah izin diberi.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceRecorder.current = recorder;
      voiceChunks.current = [];
      const generation = voiceGeneration.current;

      recorder.ondataavailable = (entry) => {
        if (entry.data.size) voiceChunks.current.push(entry.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (generation !== voiceGeneration.current) return;
        const blob = new Blob(voiceChunks.current, { type: recorder.mimeType || "audio/webm" });
        setVoice(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        setVoiceState("review");
        setVoiceMessage(
          voiceSecondsRef.current < 5
            ? "Terlalu singkat. Minimal 5 detik ya — hasil akhirnya tetap server yang menentukan."
            : "Dengarkan dulu rekamanmu sebelum dikirim.",
        );
      };

      setVoiceSeconds(0);
      voiceSecondsRef.current = 0;
      setVoiceState("recording");
      setVoiceMessage("Merekam");
      const startedAt = Date.now();
      recorder.start();
      voiceTimer.current = setInterval(
        () =>
          setVoiceSeconds(() => {
            // Anchor to wall-clock elapsed, not tick count: throttled background
            // tabs fire late but still stop at the real 30s mark.
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            if (elapsed >= 30) {
              finishRecording();
              voiceSecondsRef.current = 30;
              return 30;
            }
            voiceSecondsRef.current = elapsed;
            return elapsed;
          }),
        1000,
      );
    } catch {
      setVoiceState("error");
      setVoiceMessage("Akses mikrofon nggak diberi. Cek izinnya, lalu rekam lagi.");
    }
  }

  function resetVoice() {
    voiceGeneration.current += 1;
    finishRecording();
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoice(null);
    setVoiceUrl("");
    setVoiceSeconds(0);
    setVoiceState("idle");
    setVoiceMessage("");
  }

  function voiceErrorMessage(code?: string): string {
    const messages: Record<string, string> = {
      UNSUPPORTED_MEDIA: "Format audionya nggak didukung. Rekam ulang di browser yang didukung.",
      FILE_TOO_LARGE: "Rekamannya kegedean. Rekam yang lebih singkat.",
      AUDIO_DURATION_INVALID: "Pesan suara harus 5–30 detik. Rekam ulang di rentang itu.",
      AUDIO_UNINSPECTABLE: "Rekamannya nggak bisa diverifikasi. Rekam ulang ya.",
      VOICE_NOTE_LIMIT_REACHED: "Batas pesan suara untuk sesi ini sudah terpakai.",
      EVENT_CLOSED: "Acara ini sudah selesai. Kiriman baru nggak diterima lagi.",
      RATE_LIMITED: "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.",
      MEDIA_PERSISTENCE_FAILED: "Pesan suaranya belum terkonfirmasi tersimpan. Coba lagi.",
    };
    return messages[code ?? ""] ?? "Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi.";
  }

  function submitVoice() {
    if (!voice || voiceState === "submitting" || !session || event?.status === "CLOSED") return;
    setVoiceState("submitting");
    setVoiceMessage("Ngirim pesan suara…");
    const form = new FormData();
    form.append("voice_note", voice, "voice-note.webm");
    const request = new XMLHttpRequest();
    voiceXhrRef.current = request;
    request.open("POST", `/api/events/${encodeURIComponent(publicId)}/voice-notes`);
    request.upload.onprogress = (progress) => {
      if (progress.lengthComputable) {
        setVoiceMessage(`Ngirim pesan suara… ${Math.round((progress.loaded / progress.total) * 100)}%`);
      }
    };
    request.onload = async () => {
      voiceXhrRef.current = null;
      try {
        if (request.status === 201) {
          setVoiceState("success");
          setVoiceMessage("Pesan suara tersimpan.");
          const proceed = await confirmUsage();
          if (proceed) setState("done");
          return;
        }
        let code: string | undefined;
        try {
          code = JSON.parse(request.responseText || "{}").error?.code as string | undefined;
        } catch {
          code = undefined;
        }
        if (
          request.status === 401 &&
          ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(code ?? "")
        ) {
          resetVoice();
          handleSessionExpired();
          return;
        }
        setVoiceState("review-error");
        setVoiceMessage(voiceErrorMessage(code));
      } catch {
        setVoiceState("review-error");
        setVoiceMessage("Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi.");
      }
    };
    request.onerror = () => {
      voiceXhrRef.current = null;
      setVoiceState("review-error");
      setVoiceMessage("Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi.");
    };
    request.send(form);
  }

  function handleVoiceSkip() {
    if (voiceState === "recording" || voiceState === "submitting") return;
    resetVoice();
    setState("done");
  }

  // --- Capture auto-advance (Hanya terpicu saat foto BARU diambil/diunggah) ---
  useEffect(() => {
    const prevCount = prevPhotosCountRef.current;
    prevPhotosCountRef.current = pendingPhotos.length;

    if (state !== "post-session" || !session) return;
    if (pendingPhotos.length === 0) return;

    // Hanya auto-advance jika tamu baru saja menambah foto hingga budget 0
    if (
      pendingPhotos.length > prevCount &&
      localBudgetRemaining(session.photos_submitted, pendingPhotos) === 0
    ) {
      setState("photo-review");
    }
  }, [state, session, pendingPhotos]);

  // --- Camera lifecycle ---
  useEffect(() => {
    if (state === "post-session") {
      if (!camera.stream && (camera.permission === "idle" || camera.permission === "granted")) {
        camera.start();
      }
    } else {
      camera.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      pendingPhotosRef.current.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      expiredPendingRef.current.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      if (voiceUrlRef.current) URL.revokeObjectURL(voiceUrlRef.current);
      if (captureErrorTimer.current) clearTimeout(captureErrorTimer.current);
      voiceXhrRef.current?.abort();
      voiceXhrRef.current = null;
      finishRecording();
      stopVoiceTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const PRE_SESSION_STATES: ViewState[] = [
    "loading", "ready", "closed", "not-found", "starting",
    "invalid", "rate-limited", "offline", "unexpected",
  ];
  const screenKey = PRE_SESSION_STATES.includes(state) ? "pre-session" : state;
  const screen = (node: React.ReactNode) => (
    <div key={screenKey} className="animate-screen-enter">
      {node}
    </div>
  );

  // --- Render: pre-session states ---
  if (state !== "frame-select" && state !== "post-session-loading" && state !== "post-session" && state !== "photo-review" && state !== "voice-note" && state !== "done") {
    return screen(
      <PreSession
        event={event}
        name={name}
        state={state}
        message={message}
        carryOverPrompt={carryOverPrompt}
        expiredPending={expiredPending}
        onNameChange={setName}
        onStart={start}
        onDeclineCarryOver={() => {
          expiredPendingRef.current.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
          setCarryOverPrompt(false);
          setExpiredPending([]);
        }}
      />
    );
  }

  // --- Render: frame selection ---
  if (state === "frame-select") {
    return screen(<FrameSelection eventTitle={event!.title} onFrameConfirm={handleFrameSelect} />);
  }

  // --- Render: post-session loading ---
  if (state === "post-session-loading" && session) {
    return screen(
      <main className="min-h-dvh bg-bg-base px-5 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-text-primary sm:px-8">
        <div className="mx-auto w-full max-w-[30rem]">
          <header>
            <p className="text-xs font-medium tracking-[0.04em] text-text-muted">Masuk acara</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
              {event!.title}
            </h1>
          </header>
          <div role="status" aria-label="Memuat pemakaian sesi" className="mt-8 space-y-4">
            <div className="h-28 animate-pulse rounded-lg bg-bg-surface" />
            <div className="h-32 animate-pulse rounded-lg bg-bg-surface" />
            <p className="text-sm text-text-muted">Ngecek sesi kamu…</p>
          </div>
        </div>
      </main>
    );
  }

  // --- Render: capture ---
  if (state === "post-session" && session) {
    return screen(
      <Capture
        event={event!}
        session={session}
        pendingPhotos={pendingPhotos}
        secondsLeft={secondsLeft}
        reviewIndex={reviewIndex}
        camera={camera}
        selectedFrame={selectedFrame}
        captureError={captureError}
        onShutter={handleCapture}
        onFileSelect={handleFileSelect}
        onAdvance={() => setState("photo-review")}
        onDeletePhoto={removePhoto}
        onRetakePhoto={removePhoto}
        onRetryPhoto={retryPhoto}
        onReviewPhoto={(i) => {
          reviewReturnFocusRef.current = document.activeElement as HTMLElement | null;
          setReviewIndex(i);
        }}
        onCloseReview={() => {
          setReviewIndex(null);
          const origin = reviewReturnFocusRef.current;
          reviewReturnFocusRef.current = null;
          window.setTimeout(() => origin?.focus(), 0);
        }}
      />
    );
  }

  // --- Render: photo review (Sudah tersambung dengan onBack) ---
  if (state === "photo-review" && session) {
    return screen(
      <PhotoReview
        event={event!}
        photos={pendingPhotos}
        syncing={syncing}
        secondsLeft={secondsLeft}
        onDeletePhoto={removePhoto}
        onRetryPhoto={retryPhoto}
        onNext={handleReviewNext}
        onBack={() => setState("post-session")}
      />
    );
  }

  // --- Render: voice note ---
  if (state === "voice-note" && session) {
    return screen(
      <VoiceRecordingScreen
        event={event!}
        session={session}
        voiceState={voiceState}
        voiceSeconds={voiceSeconds}
        voiceUrl={voiceUrl}
        voiceMessage={voiceMessage}
        secondsLeft={secondsLeft}
        onRecord={recordVoice}
        onStop={finishRecording}
        onReset={resetVoice}
        onSubmit={submitVoice}
        onSkip={handleVoiceSkip}
      />
    );
  }

  // --- Render: done ---
  if (state === "done" && event) {
    const keepsakeUrl =
      [...pendingPhotos].reverse().find((p) => p.status === "confirmed")?.previewUrl ?? null;
    return screen(
      <Done
        eventTitle={event.title}
        keepsakeUrl={keepsakeUrl}
        photoUrl={keepsakeUrl ?? null}
        hasVoice={session?.voice_note_submitted ?? false}
      />
    );
  }

  return null;
}