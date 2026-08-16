"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/use-camera";
import { FrameSelector } from "@/components/frame-selector";
import { loadFrameImage, DEFAULT_FRAME_ID, type Frame } from "@/lib/frames";
import {
  applySyncResult,
  canDeletePhoto,
  canRetakePhoto,
  isEventClosedError,
  isPhotoLimitError,
  isRateLimited,
  isSessionError,
  localBudgetRemaining,
  nextPendingId,
  parseRetryAfterSeconds,
  photoErrorMessage,
  PHOTO_LIMIT,
  type PendingPhoto,
  type UsageState,
} from "@/lib/pending-photos";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };
type SessionData = UsageState & { guest_name: string | null };
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
  | "post-session";
type VoiceState = "idle" | "recording" | "review" | "submitting" | "success" | "error" | "review-error" | "unsupported";

const errorText = "The session could not start. Your name was kept. Try again.";
const recoverable: ViewState[] = ["invalid", "rate-limited", "offline", "unexpected"];
const SESSION_MAX_SECONDS = 1800;
const PRE_EXPIRY_WARN_SECONDS = 300;

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
  const syncAbortedRef = useRef(false);

  // Expiry / carry-over
  const [expiredPending, setExpiredPending] = useState<PendingPhoto[]>([]);
  const [carryOverPrompt, setCarryOverPrompt] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Voice note state (unchanged from original)
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSecondsRef = useRef(0);

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
        if (active) { setState("unexpected"); setMessage("The event could not be loaded. Try again."); }
      });
    return () => { active = false; };
  }, [publicId]);

  // --- Session expiry timer (UX hint; server expires_at is authoritative) ---
  useEffect(() => {
    if (state !== "post-session" || !sessionStartRef.current) {
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
    if (!event || (state !== "ready" && !recoverable.includes(state) && !carryOverPrompt)) return;
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
        // Redirect to frame selection; confirmUsage() is called after frame is chosen
        setState("frame-select");
        setMessage("");
        return;
      }
      const code = body.error?.code;
      if (response.status === 422 && code === "INVALID_INPUT") {
        setState("invalid");
        setMessage(body.error?.fields?.guest_name ?? "Enter a valid name or leave this field blank.");
      } else if (response.status === 429 && code === "RATE_LIMITED") {
        setState("rate-limited");
        const retryAfter = response.headers.get("Retry-After");
        setMessage(retryAfter ? `Starting is temporarily unavailable. Retry after ${retryAfter} seconds.` : "Starting is temporarily unavailable. Try again later.");
      } else if (code === "EVENT_CLOSED") {
        setState("closed");
        setMessage("This event is closed. New submissions are not accepted.");
      } else {
        setState("unexpected");
        setMessage(errorText);
      }
    } catch {
      setState("offline");
      setMessage("Starting did not complete. Check your connection, then try again.");
    }
  }

  async function confirmUsage() {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(publicId)}/session`);
      const body = (await response.json().catch(() => ({}))) as { error?: { code?: string }; guest_name?: string | null; photos_submitted?: number; photos_remaining?: number; voice_note_submitted?: boolean; voice_note_available?: boolean; event?: { status?: EventData["status"] } };
      if (response.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(body.error?.code ?? "")) {
        handleSessionExpired();
        return;
      }
      if (!response.ok || typeof body.photos_submitted !== "number" || typeof body.photos_remaining !== "number" || typeof body.voice_note_submitted !== "boolean" || typeof body.voice_note_available !== "boolean") throw new Error("usage");
      setSession({ guest_name: body.guest_name ?? null, photos_submitted: body.photos_submitted, photos_remaining: body.photos_remaining, voice_note_submitted: body.voice_note_submitted, voice_note_available: body.voice_note_available });
      if (body.event?.status === "CLOSED") setEvent((current) => current ? { ...current, status: "CLOSED" } : current);
      setState("post-session");
      setMessage(body.event?.status === "CLOSED" ? "This event is closed. New submissions are not accepted." : "Session ready.");
    } catch {
      setState("post-session");
      setMessage("Usage could not be confirmed. Check your connection, then try again.");
    }
  }

  // --- Frame selection: load overlay, confirm usage, then carry-over ---
  const handleFrameSelect = useCallback(async (frame: Frame) => {
    setSelectedFrame(frame);
    frameImgRef.current = frame.src ? await loadFrameImage(frame) : null;
    setState("post-session-loading");
    setMessage("Confirming your session usage…");
    await confirmUsage();
    // Handle carry-over after new session is established.
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
  }, [publicId, carryOverPrompt, expiredPending]);

  // --- Session expiry handler ---
  // INVARIANT: read pending photos from pendingPhotosRef, never from the
  // render closure. This handler fires from async contexts that outlive the
  // render which created them (Send-401 mid-sync, voice XHR onload, usage
  // re-confirm); a render-captured `pendingPhotos` would miss captures and
  // confirmations that happened since and carry over already-saved photos
  // (same stale-closure class as the D2 voice-duration fix).
  function handleSessionExpired() {
    // Preserve pending photos as "not saved" (UI_UX §4.2, §7).
    // "pending" and "uploading" both count as unsaved, so the in-flight
    // revert in syncPhotos() needs no await here.
    const unsaved = pendingPhotosRef.current.filter((p) => p.status !== "confirmed");
    if (unsaved.length > 0) {
      setExpiredPending(unsaved.map((p) => ({ ...p, status: "expired" as const })));
    }
    // Clear confirmed photos — they're server-persisted, not local concern.
    setPendingPhotos([]);
    setSession(null);
    sessionStartRef.current = null;
    setSecondsLeft(null);
    setSyncing(false);
    syncAbortedRef.current = true;
    setState("ready");
    setCarryOverPrompt(unsaved.length > 0);
    setMessage(
      unsaved.length > 0
        ? `Your session has expired. ${unsaved.length} photo${unsaved.length > 1 ? "s were" : " was"} not saved. Press Start to begin again.`
        : "Your session has expired. Press Start to begin again.",
    );
  }

  // --- Camera capture ---
  async function handleCapture() {
    if (!session || event?.status === "CLOSED") return;
    if (localBudgetRemaining(session.photos_submitted, pendingPhotos) <= 0) return;
    const blob = await camera.capture(frameImgRef.current);
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
    if (localBudgetRemaining(session.photos_submitted, pendingPhotos) <= 0) return;
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
  // Refuse while the target item is uploading (sync in flight).
  function deletePhoto(id: string) {
    setPendingPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (!item || item.status === "uploading") return prev;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
    setReviewIndex(null);
  }

  // --- Retake pending photo (UI_UX §4.3-5): remove item, camera viewfinder
  // is already the ready state. No auto-upload, no session mutation.
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

    // Snapshot the pending ids up-front. Match by stable id (never array
    // index) so deleting/retaking another item mid-sync cannot apply this
    // upload's result to the wrong photo.
    const ids = pendingPhotosRef.current
      .filter((p) => p.status === "pending")
      .map((p) => p.id);

    for (let i = 0; i < ids.length; i++) {
      if (syncAbortedRef.current) break;
      const itemId = ids[i];
      const item = pendingPhotosRef.current.find((p) => p.id === itemId);
      if (!item || item.status !== "pending") continue;

      // Mark as uploading
      setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "uploading" }));

      try {
        const formData = new FormData();
        formData.append("photo", item.blob, "photo.jpg");
        const response = await fetch(`/api/events/${encodeURIComponent(publicId)}/photos`, {
          method: "POST",
          body: formData,
        });
        const body = (await response.json().catch(() => ({}))) as {
          usage?: UsageState;
          error?: { code?: string };
        };

        if (response.status === 201 && body.usage) {
          setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "confirmed" }));
          setSession((prev) =>
            prev ? { ...prev, ...body.usage! } : prev,
          );
        } else {
          const code = body.error?.code;
          if (isSessionError(response.status, code)) {
            // Abort sync, transition to expiry.
            setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "pending" }));
            setSyncing(false);
            handleSessionExpired();
            return;
          }
          if (isEventClosedError(response.status, code)) {
            // Mark current + stop, no retry for remaining.
            setPendingPhotos((prev) =>
              applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
            );
            break;
          }
          if (isPhotoLimitError(response.status, code)) {
            // Mark current as error, stop sync.
            setPendingPhotos((prev) =>
              applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
            );
            break;
          }
          if (isRateLimited(response.status, code)) {
            // Pause, honor Retry-After, then resume the same item.
            const retryAfter = parseRetryAfterSeconds(response.headers.get("Retry-After"));
            setPendingPhotos((prev) => applySyncResult(prev, itemId, { status: "pending" }));
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            i--; // retry same id
            continue;
          }
          // Generic error — mark item, continue to next.
          setPendingPhotos((prev) =>
            applySyncResult(prev, itemId, { status: "error", errorCode: code, errorMessage: photoErrorMessage(code) }),
          );
        }
      } catch {
        // Network error — mark item, continue.
        setPendingPhotos((prev) =>
          applySyncResult(prev, itemId, { status: "error", errorMessage: photoErrorMessage() }),
        );
      }
    }

    setSyncing(false);
  }, [session, syncing, event, publicId]);

  // --- Voice note handlers (unchanged from original) ---
  function stopVoiceTimer() { if (voiceTimer.current) { clearInterval(voiceTimer.current); voiceTimer.current = null; } }
  function finishRecording() {
    stopVoiceTimer();
    if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
  }
  async function recordVoice() {
    if (!session || event?.status === "CLOSED" || !session.voice_note_available || voiceState === "recording" || voiceState === "submitting") return;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { setVoiceState("unsupported"); setVoiceMessage("Voice recording is not supported here. Try another browser or device."); return; }
    setVoiceMessage("Allow microphone access when your browser asks. Recording starts after permission.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); voiceRecorder.current = recorder; voiceChunks.current = [];
      recorder.ondataavailable = (entry) => { if (entry.data.size) voiceChunks.current.push(entry.data); };
      recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(voiceChunks.current, { type: recorder.mimeType || "audio/webm" }); setVoice(blob); setVoiceUrl(URL.createObjectURL(blob)); setVoiceState("review"); setVoiceMessage(voiceSecondsRef.current < 5 ? "Too short. Keep recording for at least 5 seconds when possible; the server decides whether it is accepted." : "Review your voice note before saving."); };
      setVoiceSeconds(0); voiceSecondsRef.current = 0; setVoiceState("recording"); setVoiceMessage("Recording"); recorder.start();
      voiceTimer.current = setInterval(() => setVoiceSeconds((seconds) => { if (seconds >= 29) { finishRecording(); return 30; } const next = seconds + 1; voiceSecondsRef.current = next; return next; }), 1000);
    } catch { setVoiceState("error"); setVoiceMessage("Microphone access was not granted. Check permission, then try recording again."); }
  }
  function resetVoice() { finishRecording(); if (voiceUrl) URL.revokeObjectURL(voiceUrl); setVoice(null); setVoiceUrl(""); setVoiceSeconds(0); setVoiceState("idle"); setVoiceMessage(""); }
  function submitVoice() {
    if (!voice || voiceState === "submitting" || !session || event?.status === "CLOSED") return;
    setVoiceState("submitting"); setVoiceMessage("Uploading voice note…"); const form = new FormData(); form.append("voice_note", voice, "voice-note.webm"); const request = new XMLHttpRequest(); request.open("POST", `/api/events/${encodeURIComponent(publicId)}/voice-notes`); request.upload.onprogress = (progress) => { if (progress.lengthComputable) setVoiceMessage(`Uploading voice note… ${Math.round(progress.loaded / progress.total * 100)}%`); };
    request.onload = async () => {
      try {
        if (request.status === 201) { setVoiceState("success"); setVoiceMessage("Voice note saved."); await confirmUsage(); return; }
        let code: string | undefined;
        try { code = (JSON.parse(request.responseText || "{}").error?.code as string | undefined); } catch { code = undefined; }
        if (request.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(code ?? "")) { resetVoice(); handleSessionExpired(); return; }
        setVoiceState("review-error"); setVoiceMessage(code === "UNSUPPORTED_MEDIA" ? "This audio format is not supported. Record again in a supported browser." : code === "FILE_TOO_LARGE" ? "This voice note is too large. Record a shorter note." : code === "AUDIO_DURATION_INVALID" ? "Voice notes must be 5–30 seconds. Re-record within that range." : code === "AUDIO_UNINSPECTABLE" ? "The voice note could not be verified. Re-record it." : code === "VOICE_NOTE_LIMIT_REACHED" ? "Voice-note limit reached for this guest session." : code === "EVENT_CLOSED" ? "This event is closed. New submissions are not accepted." : code === "RATE_LIMITED" ? "Too many requests. Wait, then try again deliberately." : code === "MEDIA_PERSISTENCE_FAILED" ? "The voice note was not confirmed as saved. Try again." : "The voice note could not be uploaded. Check your connection, then try again.");
      } catch { setVoiceState("review-error"); setVoiceMessage("The voice note could not be confirmed as saved. Check your connection, then try again."); }
    };
    request.onerror = () => { setVoiceState("review-error"); setVoiceMessage("The voice note could not be confirmed as saved. Check your connection, then try again."); }; request.send(form);
  }

  // --- Auto-start camera when entering post-session ---
  useEffect(() => {
    if (state === "post-session" && camera.permission === "idle") {
      camera.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // --- Cleanup object URLs on unmount ---
  useEffect(() => {
    return () => {
      pendingPhotos.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      expiredPending.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Derived state ---
  const closed = event?.status === "CLOSED";
  const serverAccepted = session?.photos_submitted ?? 0;
  const budgetRemaining = session
    ? localBudgetRemaining(serverAccepted, pendingPhotos)
    : PHOTO_LIMIT;
  const hasPending = pendingPhotos.some((p) => p.status === "pending");
  const hasErrors = pendingPhotos.some((p) => p.status === "error");
  const showPreExpiryWarning = secondsLeft !== null && secondsLeft <= PRE_EXPIRY_WARN_SECONDS && secondsLeft > 0;

  // --- Render: loading ---
  if (state === "loading") return <Shell><Skeleton /><p role="status" className="sr-only">Loading event.</p></Shell>;
  if (state === "not-found") return <Shell><Status title="Event unavailable" message="This event cannot be found." /></Shell>;
  if (!event) return <Shell><Status title="Event unavailable" message={message} retry={loadAgain} /></Shell>;

  // --- Render: frame selection (between Start and camera) ---
  if (state === "frame-select") {
    return (
      <Shell>
        <Header title={event.title} />
        <FrameSelector onSelect={handleFrameSelect} />
      </Shell>
    );
  }

  // --- Render: post-session (camera-first capture screen) ---
  if ((state === "post-session-loading" || state === "post-session") && session) {
    return (
      <Shell>
        <div className="space-y-6">
          <Header title={event.title} />
          <p className="text-sm text-muted-foreground">
            Guest: <span className="font-medium text-foreground">{session.guest_name || "Anonymous Guest"}</span>
          </p>

          {state === "post-session-loading" ? (
            <UsageSkeleton />
          ) : (
            <>
              {closed && (
                <Status title="Event closed" message="Your session remains viewable, but new submissions are not accepted." />
              )}

              {showPreExpiryWarning && (
                <div role="status" className="rounded-[var(--radius)] border border-warning/40 bg-warning-surface p-4 shadow-[var(--shadow-1)]">
                  <p className="text-sm font-medium text-warning-foreground">
                    Your session ends in {Math.ceil(secondsLeft! / 60)} minute{Math.ceil(secondsLeft! / 60) > 1 ? "s" : ""}. Send your photos to save them.
                  </p>
                </div>
              )}

              {/* Camera-first capture screen */}
              <section aria-labelledby="capture-heading" className="space-y-3">
                <h2 id="capture-heading" className="font-display text-xl font-semibold">Take photos</h2>

                {budgetRemaining <= 0 && !closed && (
                  <p className="text-sm text-muted-foreground">Photo limit reached for this guest session.</p>
                )}

                {/* Viewfinder or fallback */}
                <CameraViewfinder
                  camera={camera}
                  closed={closed}
                  budgetRemaining={budgetRemaining}
                  onCapture={handleCapture}
                  frameOverlaySrc={selectedFrame?.src}
                />

                {/* Remaining counter */}
                <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                  {budgetRemaining} photo{budgetRemaining !== 1 ? "s" : ""} remaining
                </p>

                {/* File picker fallback */}
                <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-secondary px-4 text-sm font-semibold focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
                  <span>Choose a photo</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={closed || budgetRemaining <= 0}
                  />
                </label>

                {/* Pending photo strip */}
                {pendingPhotos.length > 0 && (
                  <PendingStrip
                    photos={pendingPhotos}
                    onReview={(i) => setReviewIndex(i)}
                    onRetry={retryPhoto}
                  />                )}

                {/* Sync button */}
                {hasPending && (
                  <button
                    type="button"
                    onClick={syncPhotos}
                    disabled={closed || syncing}
                    className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {syncing ? "Sending…" : `Send ${pendingPhotos.filter((p) => p.status === "pending").length} photo${pendingPhotos.filter((p) => p.status === "pending").length > 1 ? "s" : ""}`}
                  </button>
                )}

                {/* Sync summary */}
                {syncing && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Sending photos…
                  </p>
                )}
                {!syncing && !hasPending && pendingPhotos.length > 0 && (
                  <p role="status" className="text-sm text-success">
                    {pendingPhotos.filter((p) => p.status === "confirmed").length} photo{pendingPhotos.filter((p) => p.status === "confirmed").length > 1 ? "s" : ""} saved.
                    {hasErrors && ` ${pendingPhotos.filter((p) => p.status === "error").length} could not be saved.`}
                  </p>
                )}
              </section>

              {/* Voice note (separate flow, unchanged) */}
              <section aria-label="Voice note" className="space-y-3">
                <VoiceAction
                  closed={closed}
                  limit={!session.voice_note_available}
                  state={voiceState}
                  voiceUrl={voiceUrl}
                  seconds={voiceSeconds}
                  message={voiceMessage}
                  onRecord={recordVoice}
                  onStop={finishRecording}
                  onReset={resetVoice}
                  onSubmit={submitVoice}
                />
              </section>

              {/* Usage panel */}
              <section aria-labelledby="usage-heading" className="rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]">
                <h2 id="usage-heading" className="font-display text-xl font-semibold">Your session</h2>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <p className="rounded-md bg-muted px-3 py-3 tabular-nums">
                    Photos remaining: <strong>{session.photos_remaining}/5</strong>
                  </p>
                  <p className="rounded-md bg-muted px-3 py-3">
                    Voice note: <strong>{session.voice_note_available ? "Available" : "Already added"}</strong>
                  </p>
                </div>
              </section>

              <p role="status" className="text-sm text-muted-foreground">{message}</p>
            </>
          )}
        </div>

        {/* Review overlay */}
        {reviewIndex !== null && reviewIndex < pendingPhotos.length && (
          <ReviewOverlay
            photo={pendingPhotos[reviewIndex]}
            canRetake={canRetakePhoto(pendingPhotos[reviewIndex].status)}
            canDelete={canDeletePhoto(pendingPhotos[reviewIndex].status)}
            onClose={() => setReviewIndex(null)}
            onRetake={() => retakePhoto(pendingPhotos[reviewIndex].id)}
            onDelete={() => deletePhoto(pendingPhotos[reviewIndex].id)}
          />
        )}
      </Shell>
    );
  }

  // --- Render: pre-session (Start form) ---
  const blocked = state === "closed";
  const failed = recoverable.includes(state);
  return (
    <Shell>
      <Header title={event.title} />
      {blocked && <Status title="Event closed" message="This event remains viewable, but new submissions are not accepted." />}
      {failed && <Status title={state === "invalid" ? "Check your name" : "Could not start"} message={message} />}

      {/* Carry-over prompt */}
      {carryOverPrompt && expiredPending.length > 0 && (
        <div role="alert" className="mt-8 rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]">
          <h2 className="font-display text-xl font-semibold">Unsaved photos from your previous session</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You have {expiredPending.length} photo{expiredPending.length > 1 ? "s" : ""} that {expiredPending.length > 1 ? "were" : "was"} not saved.
            If you start again, you can add {expiredPending.length > 1 ? "them" : "it"} to this new session.
            {" "}{expiredPending.length > 1 ? "They" : "It"} will count toward your 5-photo limit.
          </p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {expiredPending.map((p) => (
              <img key={p.id} src={p.previewUrl} alt="Unsaved photo" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setCarryOverPrompt(false); setExpiredPending([]); }}
            className="mt-4 min-h-12 rounded-md bg-secondary px-5 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Discard unsaved photos
          </button>
        </div>
      )}

      <form onSubmit={start} className="mt-8 space-y-6" aria-busy={state === "starting"}>
        <div className="space-y-2">
          <label htmlFor="guest-name" className="text-sm font-medium">
            Your name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="guest-name"
            name="guest_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={blocked || state === "starting"}
            className="h-12 w-full rounded-md border bg-background px-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-describedby="name-help"
          />
          <p id="name-help" className="text-sm text-muted-foreground">Your name applies to submissions in this session.</p>
        </div>
        <button
          type="submit"
          disabled={blocked || state === "starting"}
          className="h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] transition duration-200 ease-out hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
        >
          {state === "starting" ? "Starting…" : carryOverPrompt ? "Start and add unsaved photos" : "Start"}
        </button>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {state === "starting" ? "Starting your session…" : ""}
        </p>
      </form>
    </Shell>
  );

  function loadAgain() { window.location.reload(); }
}

// --- Sub-components ---

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-5 pt-8 pb-[calc(2rem_+_env(safe-area-inset-bottom))] text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header>
      <p className="text-sm font-medium text-muted-foreground">Guest entry</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">{title}</h1>
    </header>
  );
}

function Status({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return (
    <section role="alert" className="mt-8 rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {retry && (
        <button type="button" onClick={retry} className="mt-5 h-12 rounded-md bg-primary px-5 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Try again
        </button>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-12 w-4/5 animate-pulse rounded bg-muted" />
      <div className="mt-10 h-12 animate-pulse rounded bg-muted" />
      <div className="h-12 animate-pulse rounded bg-muted" />
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div role="status" aria-label="Loading session usage" className="space-y-4">
      <div className="h-28 animate-pulse rounded-[var(--radius)] bg-muted" />
      <div className="h-32 animate-pulse rounded-[var(--radius)] bg-muted" />
      <p className="text-sm text-muted-foreground">Loading your session usage…</p>
    </div>
  );
}

function CameraViewfinder({
  camera,
  closed,
  budgetRemaining,
  onCapture,
  frameOverlaySrc,
}: {
  camera: ReturnType<typeof useCamera>;
  closed: boolean;
  budgetRemaining: number;
  onCapture: () => void;
  frameOverlaySrc?: string;
}) {
  const { stream, permission, cameraCount, switchCamera } = camera;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (permission === "idle" || permission === "requesting") {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-[var(--radius)] bg-muted">
        <p className="text-sm text-muted-foreground">Starting camera…</p>
      </div>
    );
  }

  if (permission === "denied" || permission === "unsupported") {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-1)]">
        <p className="text-sm text-muted-foreground">
          {permission === "denied"
            ? "Camera access was not granted. You can still choose a photo below."
            : "Camera is not available in this browser. You can still choose a photo below."}
        </p>
      </div>
    );
  }

  // permission === "granted"
  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] bg-foreground">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="aspect-[3/4] w-full object-cover"
        aria-label="Camera preview"
      />
      {frameOverlaySrc && (
        <img
          src={frameOverlaySrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        />
      )}
      {cameraCount >= 2 && (
        <button
          type="button"
          onClick={switchCamera}
          className="absolute right-3 top-3 min-h-12 min-w-12 rounded-full bg-background/80 px-3 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Switch camera"
        >
          ↻
        </button>
      )}
      <button
        type="button"
        onClick={onCapture}
        disabled={closed || budgetRemaining <= 0}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 h-16 w-16 rounded-full border-4 border-background bg-primary shadow-[var(--shadow-2)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
        aria-label="Take photo"
      />
    </div>
  );
}

function PendingStrip({
  photos,
  onReview,
  onRetry,
}: {
  photos: PendingPhoto[];
  onReview: (index: number) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Captured photos">
      {photos.map((photo, index) => (
        <div key={photo.id} role="listitem" className="relative shrink-0">
          <button
            type="button"
            onClick={() => onReview(index)}
            className="block h-12 w-12 overflow-hidden rounded-md border bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Photo ${index + 1}, ${photo.status}`}
          >
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
          <PendingStatusBadge status={photo.status} />
          {photo.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(photo.id)}
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-destructive text-xs font-bold text-destructive-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Retry upload"
            >
              ↻
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PendingStatusBadge({ status }: { status: PendingPhoto["status"] }) {
  if (status === "pending") return null;
  const label =
    status === "uploading" ? "…" :
    status === "confirmed" ? "✓" :
    status === "error" ? "!" :
    status === "expired" ? "✕" : "";
  const bg =
    status === "uploading" ? "bg-muted-foreground" :
    status === "confirmed" ? "bg-success" :
    status === "error" ? "bg-destructive" :
    status === "expired" ? "bg-warning" : "bg-muted";
  return (
    <span
      className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${bg} text-xs font-bold text-background`}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function ReviewOverlay({
  photo,
  canRetake,
  canDelete,
  onClose,
  onRetake,
  onDelete,
}: {
  photo: PendingPhoto;
  canRetake: boolean;
  canDelete: boolean;
  onClose: () => void;
  onRetake: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4"
      role="dialog"
      aria-label="Photo review"
    >
      <div className="relative w-full max-w-md rounded-[var(--radius)] bg-card p-4 shadow-[var(--shadow-2)]">
        <div className="aspect-square overflow-hidden rounded-md bg-muted">
          <img src={photo.previewUrl} alt="Photo review" className="h-full w-full object-cover" />
        </div>
        {photo.errorMessage && (
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{photo.errorMessage}</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Status:{" "}
          {photo.status === "pending" ? "Not sent yet" :
           photo.status === "uploading" ? "Sending…" :
           photo.status === "confirmed" ? "Saved" :
           photo.status === "error" ? "Not saved" :
           photo.status === "expired" ? "Not saved — session expired" : photo.status}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back
          </button>
          {canRetake && (
            <button
              type="button"
              onClick={onRetake}
              className="min-h-12 flex-1 rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Retake
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-12 flex-1 rounded-md bg-destructive px-4 font-semibold text-destructive-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceAction({ closed, limit, state, voiceUrl, seconds, message, onRecord, onStop, onReset, onSubmit }: {
  closed: boolean;
  limit: boolean;
  state: VoiceState;
  voiceUrl: string;
  seconds: number;
  message: string;
  onRecord: () => void;
  onStop: () => void;
  onReset: () => void;
  onSubmit: () => void;
}) {
  const disabled = closed || limit || state === "submitting";
  const isError = (state as string) === "error";
  return (
    <div className="rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-1)]">
      <h3 className="font-semibold">Add a voice note</h3>
      {limit ? (
        <p className="mt-3 text-sm text-muted-foreground">Voice-note limit reached for this guest session.</p>
      ) : closed ? (
        <p className="mt-3 text-sm text-muted-foreground">New submissions are not accepted while this event is closed.</p>
      ) : state === "unsupported" ? (
        <p role="alert" className="mt-3 text-sm text-muted-foreground">{message}</p>
      ) : state === "idle" || isError ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Record one voice note, 5–30 seconds. Microphone permission will be requested after you choose Record.</p>
          <button type="button" disabled={disabled} onClick={onRecord} className="min-h-12 w-full rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Record</button>
          {message && <p role={isError ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p>}
        </div>
      ) : state === "recording" ? (
        <div className="mt-3 space-y-3" role="status" aria-live="polite">
          <p className="font-semibold">
            <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full bg-recording" />Recording
          </p>
          <p className="font-mono text-2xl tabular-nums">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </p>
          <button type="button" onClick={onStop} className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Stop recording</button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <audio controls src={voiceUrl} className="w-full" aria-label="Voice note playback" />
          <p className="text-sm text-muted-foreground">
            Duration: <span className="tabular-nums">{seconds}s</span>
            {seconds < 5 && <strong className="ml-2">Too short</strong>}
          </p>
          {seconds < 5 && <p className="text-sm text-muted-foreground">Keep recording for at least 5 seconds where possible, then re-record.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={onSubmit} className="min-h-12 rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {state === "submitting" ? "Saving…" : "Submit voice note"}
            </button>
            <button type="button" disabled={state === "submitting"} onClick={onReset} className="min-h-12 rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Re-record</button>
          </div>
          {state === "submitting" && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
          {state === "success" && <p role="status" className="text-sm text-success">{message}</p>}
          {state === "review-error" && <p role="alert" className="text-sm text-muted-foreground">{message}</p>}
        </div>
      )}
    </div>
  );
}
