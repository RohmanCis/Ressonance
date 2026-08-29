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
  const [syncing, setSyncing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewReturnFocusRef = useRef<HTMLElement | null>(null);
  const syncAbortedRef = useRef(false);
  // Set when the review CTA requested an advance after sync; the effect
  // consumes it once the sync's final state commits (race fix, 2026-08-20).
  const advancePendingRef = useRef(false);

  // Expiry / carry-over
  const [expiredPending, setExpiredPending] = useState<PendingPhoto[]>([]);
  const expiredPendingRef = useRef<PendingPhoto[]>([]);
  expiredPendingRef.current = expiredPending;
  const [carryOverPrompt, setCarryOverPrompt] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Voice note state — presented as the dedicated full-screen VOICE_NOTE
  // step after photo review (DESIGN.md §5.5).
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
  const voiceSecondsRef = useRef(0);
  const voiceGeneration = useRef(0);

  const camera = useCamera();

  // Frame selection (guest chooses before the camera opens)
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);

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

  // --- Session expiry timer (UX hint; server expires_at is authoritative) ---
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
    if (!event || (state !== "ready" && state !== "invalid" && state !== "rate-limited" && state !== "offline" && state !== "unexpected" && !carryOverPrompt)) return;
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
    } catch {
      setState("offline");
      setMessage("Sesi belum berhasil dimulai. Cek koneksimu, lalu coba lagi.");
    }
  }

  /**
   * Refresh authoritative usage from the server. Returns false only when the
   * session was discarded (expiry handled); on network failure it returns
   * true so the flow never dead-ends (previous confirmUsage behavior).
   */
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

  // --- Frame selection: load overlay, confirm usage, then carry-over ---
  const handleFrameSelect = useCallback(async (frame: Frame) => {
    setSelectedFrame(frame);
    frameImgRef.current = frame.src ? await loadFrameImage(frame) : null;
    setState("post-session-loading");
    setMessage("Ngecek sesimu dulu…");
    const proceed = await confirmUsage();
    if (!proceed) return;
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
    setState("post-session");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, carryOverPrompt, expiredPending]);

  // --- Session expiry handler ---
  function handleSessionExpired() {
    const unsaved = pendingPhotosRef.current.filter((p) => p.status !== "confirmed");
    if (unsaved.length > 0) {
      setExpiredPending(unsaved.map((p) => ({ ...p, status: "expired" as const })));
    }
    setPendingPhotos([]);
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

  // --- Camera capture (dynamic frame: overlay asset + event-title layers) ---
  async function handleCapture() {
    if (!session || event?.status === "CLOSED" || !event) return;
    const blob = await camera.capture({
      frameImg: frameImgRef.current,
      eventTitle: event.title,
      layers: selectedFrame?.textLayers ?? [],
    });
    if (!blob) return;
    const photo: PendingPhoto = {
      id: nextPendingId(),
      blob,
      previewUrl: URL.createObjectURL(blob),
      status: "pending",
    };
    setPendingPhotos((prev) => [...prev, photo]);
  }

  // --- File picker fallback ---
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

  // --- Delete pending photo ---
  function deletePhoto(id: string) {
    setPendingPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (!item || item.status === "uploading") return prev;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setReviewIndex(null);
  }

  // --- Retake pending photo ---
  function retakePhoto(id: string) {
    setPendingPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (!item || item.status === "uploading") return prev;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setReviewIndex(null);
  }

  // --- Retry a single errored photo ---
  function retryPhoto(id: string) {
    setPendingPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "pending", errorCode: undefined, errorMessage: undefined } : p)),
    );
  }

  // --- Batch sync: sequential POST /photos ---
  const syncPhotos = useCallback(async () => {
    if (!session || syncing || event?.status === "CLOSED") return;
    syncAbortedRef.current = false;
    setSyncing(true);

    const ids = pendingPhotosRef.current
      .filter((p) => p.status === "pending")
      .map((p) => p.id);

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

    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, syncing, event, publicId]);

  // --- Review → Voice note: sync first, advance only when everything is
  // confirmed (voice note is the dedicated next step, DESIGN.md §5.5).
  async function handleReviewNext() {
    if (syncing) return;
    if (pendingPhotosRef.current.some((p) => p.status === "pending")) {
      advancePendingRef.current = true;
      await syncPhotos();
      // Advance is deferred to the effect below: pendingPhotosRef.current is
      // still stale ("uploading") here because the sync loop's final state
      // updates have not committed yet.
      return;
    }
    // Nothing left to sync — no in-flight state, so the ref is current.
    if (pendingPhotosRef.current.every((p) => p.status === "confirmed")) {
      setState("voice-note");
    }
  }

  // Deferred advance: fires after React commits the sync loop's last state
  // update (syncing → false, items → confirmed), so the predicate reads the
  // committed ref — single CTA click syncs AND advances.
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

  // --- Voice note handlers ---
  function stopVoiceTimer() { if (voiceTimer.current) { clearInterval(voiceTimer.current); voiceTimer.current = null; } }
  function finishRecording() {
    stopVoiceTimer();
    if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
  }
  async function recordVoice() {
    if (!session || event?.status === "CLOSED" || !session.voice_note_available || voiceState === "recording" || voiceState === "submitting") return;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { setVoiceState("unsupported"); setVoiceMessage("Rekaman suara nggak didukung di sini. Coba browser atau perangkat lain."); return; }
    setVoiceMessage("Browser bakal minta izin mikrofon. Rekamannya mulai setelah izin diberi.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); voiceRecorder.current = recorder; voiceChunks.current = [];
      const generation = voiceGeneration.current;
      recorder.ondataavailable = (entry) => { if (entry.data.size) voiceChunks.current.push(entry.data); };
      recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); if (generation !== voiceGeneration.current) return; const blob = new Blob(voiceChunks.current, { type: recorder.mimeType || "audio/webm" }); setVoice(blob); setVoiceUrl(URL.createObjectURL(blob)); setVoiceState("review"); setVoiceMessage(voiceSecondsRef.current < 5 ? "Terlalu singkat. Minimal 5 detik ya — hasil akhirnya tetap server yang menentukan." : "Dengarkan dulu rekamanmu sebelum dikirim."); };
      setVoiceSeconds(0); voiceSecondsRef.current = 0; setVoiceState("recording"); setVoiceMessage("Merekam"); recorder.start();
      voiceTimer.current = setInterval(() => setVoiceSeconds((seconds) => { if (seconds >= 29) { finishRecording(); return 30; } const next = seconds + 1; voiceSecondsRef.current = next; return next; }), 1000);
    } catch { setVoiceState("error"); setVoiceMessage("Akses mikrofon nggak diberi. Cek izinnya, lalu rekam lagi."); }
  }
  function resetVoice() { voiceGeneration.current += 1; finishRecording(); if (voiceUrl) URL.revokeObjectURL(voiceUrl); setVoice(null); setVoiceUrl(""); setVoiceSeconds(0); setVoiceState("idle"); setVoiceMessage(""); }
  function submitVoice() {
    if (!voice || voiceState === "submitting" || !session || event?.status === "CLOSED") return;
    setVoiceState("submitting"); setVoiceMessage("Ngirim pesan suara…"); const form = new FormData(); form.append("voice_note", voice, "voice-note.webm"); const request = new XMLHttpRequest(); request.open("POST", `/api/events/${encodeURIComponent(publicId)}/voice-notes`); request.upload.onprogress = (progress) => { if (progress.lengthComputable) setVoiceMessage(`Ngirim pesan suara… ${Math.round(progress.loaded / progress.total * 100)}%`); };
    request.onload = async () => {
      try {
        if (request.status === 201) {
          setVoiceState("success"); setVoiceMessage("Pesan suara tersimpan.");
          const proceed = await confirmUsage();
          if (proceed) setState("done");
          return;
        }
        let code: string | undefined;
        try { code = (JSON.parse(request.responseText || "{}").error?.code as string | undefined); } catch { code = undefined; }
        if (request.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(code ?? "")) { resetVoice(); handleSessionExpired(); return; }
        setVoiceState("review-error"); setVoiceMessage(code === "UNSUPPORTED_MEDIA" ? "Format audionya nggak didukung. Rekam ulang di browser yang didukung." : code === "FILE_TOO_LARGE" ? "Rekamannya kegedean. Rekam yang lebih singkat." : code === "AUDIO_DURATION_INVALID" ? "Pesan suara harus 5–30 detik. Rekam ulang di rentang itu." : code === "AUDIO_UNINSPECTABLE" ? "Rekamannya nggak bisa diverifikasi. Rekam ulang ya." : code === "VOICE_NOTE_LIMIT_REACHED" ? "Batas pesan suara untuk sesi ini sudah terpakai." : code === "EVENT_CLOSED" ? "Acara ini sudah selesai. Kiriman baru nggak diterima lagi." : code === "RATE_LIMITED" ? "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi." : code === "MEDIA_PERSISTENCE_FAILED" ? "Pesan suaranya belum terkonfirmasi tersimpan. Coba lagi." : "Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi.");
      } catch { setVoiceState("review-error"); setVoiceMessage("Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi."); }
    };
    request.onerror = () => { setVoiceState("review-error"); setVoiceMessage("Pesan suara gagal dikirim. Cek koneksimu, lalu coba lagi."); }; request.send(form);
  }

  // --- Skip voice: discard any unsent take (§4.5) and finish the flow ---
  function handleVoiceSkip() {
    if (voiceState === "recording" || voiceState === "submitting") return;
    resetVoice();
    setState("done");
  }

  // --- Capture auto-advance: full local budget → photo review ---
  useEffect(() => {
    if (state !== "post-session" || !session) return;
    if (pendingPhotos.length === 0) return;
    if (localBudgetRemaining(session.photos_submitted, pendingPhotos) === 0) {
      setState("photo-review");
    }
  }, [state, session, pendingPhotos]);

  // --- Camera lifecycle: run only on the capture screen ---
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

  // --- Cleanup object URLs on unmount ---
  useEffect(() => {
    return () => {
      pendingPhotosRef.current.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      expiredPendingRef.current.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      if (voiceUrlRef.current) URL.revokeObjectURL(voiceUrlRef.current);
    };
  }, []);

  // --- Render: pre-session states ---
  if (state !== "frame-select" && state !== "post-session-loading" && state !== "post-session" && state !== "photo-review" && state !== "voice-note" && state !== "done") {
    return (
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
          setCarryOverPrompt(false);
          setExpiredPending([]);
        }}
      />
    );
  }

  // --- Render: frame selection ---
  if (state === "frame-select") {
    return <FrameSelection eventTitle={event!.title} onFrameConfirm={handleFrameSelect} />;
  }

  // --- Render: post-session loading ---
  if (state === "post-session-loading" && session) {
    return (
      <main className="min-h-dvh bg-bg-base px-5 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-text-primary sm:px-8">
        <div className="mx-auto w-full max-w-[30rem]">
          <header>
            <p className="text-xs font-medium tracking-[0.04em] text-text-muted">Masuk acara</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
              {event!.title}
            </h1>
          </header>
          <div role="status" aria-label="Loading session usage" className="mt-8 space-y-4">
            <div className="h-28 animate-pulse rounded-lg bg-bg-surface" />
            <div className="h-32 animate-pulse rounded-lg bg-bg-surface" />
            <p className="text-sm text-text-muted">Ngecek sesi kamu…</p>
          </div>
        </div>
      </main>
    );
  }

  // --- Render: capture (camera only — voice is a dedicated later step) ---
  if (state === "post-session" && session) {
    return (
      <Capture
        event={event!}
        session={session}
        pendingPhotos={pendingPhotos}
        secondsLeft={secondsLeft}
        reviewIndex={reviewIndex}
        camera={camera}
        selectedFrame={selectedFrame}
        onShutter={handleCapture}
        onFileSelect={handleFileSelect}
        onAdvance={() => setState("photo-review")}
        onDeletePhoto={deletePhoto}
        onRetakePhoto={retakePhoto}
        onRetryPhoto={retryPhoto}
        onReviewPhoto={(i) => {
          // Focus restore (mirrors admin openPreview/closePreview): remember
          // the opener so closing the review overlay returns focus to it.
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

  // --- Render: photo review ---
  if (state === "photo-review" && session) {
    return (
      <PhotoReview
        event={event!}
        photos={pendingPhotos}
        syncing={syncing}
        secondsLeft={secondsLeft}
        onDeletePhoto={deletePhoto}
        onRetryPhoto={retryPhoto}
        onNext={handleReviewNext}
      />
    );
  }

  // --- Render: voice note (dedicated full-screen step, DESIGN.md §5.5) ---
  if (state === "voice-note" && session) {
    return (
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
    // Keepsake: last server-confirmed capture, still in client memory (§5.4).
    const keepsakeUrl =
      [...pendingPhotos].reverse().find((p) => p.status === "confirmed")?.previewUrl ?? null;
    return (
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
