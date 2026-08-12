"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };
type SessionData = {
  guest_name: string | null;
  photos_submitted: number;
  photos_remaining: number;
  voice_note_submitted: boolean;
  voice_note_available: boolean;
};
type ViewState = "loading" | "ready" | "closed" | "not-found" | "starting" | "invalid" | "rate-limited" | "offline" | "unexpected" | "post-session-loading" | "post-session";
type PhotoState = "idle" | "selected" | "submitting" | "success" | "error";
type VoiceState = "idle" | "recording" | "review" | "submitting" | "success" | "error" | "unsupported";

const errorText = "The session could not start. Your name was kept. Try again.";
const recoverable: ViewState[] = ["invalid", "rate-limited", "offline", "unexpected"];

export function GuestEventEntry({ publicId }: { publicId: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [name, setName] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoState, setPhotoState] = useState<PhotoState>("idle");
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoProgress, setPhotoProgress] = useState(0);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/events/${encodeURIComponent(publicId)}`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setState("not-found");
          return;
        }
        if (!response.ok) throw new Error("event");
        const body = (await response.json()) as { event?: EventData };
        if (!body.event?.title || !["ACTIVE", "CLOSED"].includes(body.event.status)) throw new Error("event");
        setEvent(body.event);
        setState(body.event.status === "CLOSED" ? "closed" : "ready");
      })
      .catch(() => {
        if (active) {
          setState("unexpected");
          setMessage("The event could not be loaded. Try again.");
        }
      });
    return () => { active = false; };
  }, [publicId]);

  async function start(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!event || (state !== "ready" && !recoverable.includes(state))) return;
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
        setState("post-session-loading");
        setMessage("Confirming your session usage…");
        await confirmUsage();
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
        setSession(null); setState("ready"); setMessage("Your session is no longer valid. Press Start to begin again."); return;
      }
      if (!response.ok || typeof body.photos_submitted !== "number" || typeof body.photos_remaining !== "number" || typeof body.voice_note_submitted !== "boolean" || typeof body.voice_note_available !== "boolean") throw new Error("usage");
      setSession({ guest_name: body.guest_name ?? null, photos_submitted: body.photos_submitted, photos_remaining: body.photos_remaining, voice_note_submitted: body.voice_note_submitted, voice_note_available: body.voice_note_available });
      if (body.event?.status === "CLOSED") setEvent((current) => current ? { ...current, status: "CLOSED" } : current);
      setState("post-session"); setMessage(body.event?.status === "CLOSED" ? "This event is closed. New submissions are not accepted." : "Session ready.");
    } catch { setState("post-session"); setMessage("Usage could not be confirmed. Check your connection, then try again."); }
  }

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
      recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(voiceChunks.current, { type: recorder.mimeType || "audio/webm" }); setVoice(blob); setVoiceUrl(URL.createObjectURL(blob)); setVoiceState("review"); setVoiceMessage(voiceSeconds < 5 ? "Too short. Keep recording for at least 5 seconds when possible; the server decides whether it is accepted." : "Review your voice note before saving."); };
      setVoiceSeconds(0); setVoiceState("recording"); setVoiceMessage("Recording"); recorder.start();
      voiceTimer.current = setInterval(() => setVoiceSeconds((seconds) => { if (seconds >= 29) { finishRecording(); return 30; } return seconds + 1; }), 1000);
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
        if (request.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(code ?? "")) { resetVoice(); setSession(null); setState("ready"); setMessage("Your session is no longer valid. Press Start to begin again."); return; }
        setVoiceState("error"); setVoiceMessage(code === "UNSUPPORTED_MEDIA" ? "This audio format is not supported. Record again in a supported browser." : code === "FILE_TOO_LARGE" ? "This voice note is too large. Record a shorter note." : code === "AUDIO_DURATION_INVALID" ? "Voice notes must be 5–30 seconds. Re-record within that range." : code === "AUDIO_UNINSPECTABLE" ? "The voice note could not be verified. Re-record it." : code === "VOICE_NOTE_LIMIT_REACHED" ? "Voice-note limit reached for this guest session." : code === "EVENT_CLOSED" ? "This event is closed. New submissions are not accepted." : code === "RATE_LIMITED" ? "Too many requests. Wait, then try again deliberately." : code === "MEDIA_PERSISTENCE_FAILED" ? "The voice note was not confirmed as saved. Try again." : "The voice note could not be uploaded. Check your connection, then try again.");
      } catch { setVoiceState("error"); setVoiceMessage("The voice note was not confirmed as saved. Check your connection, then try again."); }
    };
    request.onerror = () => { setVoiceState("error"); setVoiceMessage("The voice note was not confirmed as saved. Check your connection, then try again."); }; request.send(form);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file); setPhotoPreview(URL.createObjectURL(file)); setPhotoState("selected"); setPhotoMessage(""); setPhotoProgress(0); event.target.value = "";
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null); setPhotoPreview(""); setPhotoState("idle"); setPhotoMessage(""); setPhotoProgress(0);
  }

  function submitPhoto() {
    if (!photo || photoState === "submitting" || !session || event?.status === "CLOSED") return;
    setPhotoState("submitting"); setPhotoMessage("Uploading photo…"); setPhotoProgress(0);
    const form = new FormData(); form.append("photo", photo);
    const request = new XMLHttpRequest(); request.open("POST", `/api/events/${encodeURIComponent(publicId)}/photos`);
    request.upload.onprogress = (progress) => { if (progress.lengthComputable) setPhotoProgress(Math.round((progress.loaded / progress.total) * 100)); };
    request.onload = async () => {
      try {
        if (request.status === 201) { setPhotoState("success"); setPhotoMessage("Photo saved."); await confirmUsage(); return; }
        let code: string | undefined;
        try { code = (JSON.parse(request.responseText || "{}").error?.code as string | undefined); } catch { code = undefined; }
        if (request.status === 401 && ["SESSION_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED"].includes(code ?? "")) { removePhoto(); setSession(null); setState("ready"); setMessage("Your session is no longer valid. Press Start to begin again."); return; }
        setPhotoState("error"); setPhotoMessage(code === "UNSUPPORTED_MEDIA" ? "This image format is not supported. Choose another photo." : code === "FILE_TOO_LARGE" ? "This photo is too large. Choose a smaller file." : code === "PHOTO_LIMIT_REACHED" ? "Photo limit reached for this guest session." : code === "EVENT_CLOSED" ? "This event is closed. New submissions are not accepted." : code === "RATE_LIMITED" ? "Too many requests. Wait, then try again deliberately." : code === "MEDIA_PERSISTENCE_FAILED" ? "The photo was not confirmed as saved. Try again." : "The photo could not be uploaded. Check your connection, then try again.");
      } catch { setPhotoState("error"); setPhotoMessage("The photo was not confirmed as saved. Check your connection, then try again."); }
    };
    request.onerror = () => { setPhotoState("error"); setPhotoMessage("The photo was not confirmed as saved. Check your connection, then try again."); };
    request.send(form);
  }

  if (state === "loading") return <Shell><Skeleton /><p role="status" className="sr-only">Loading event.</p></Shell>;
  if (state === "not-found") return <Shell><Status title="Event unavailable" message="This event cannot be found." /></Shell>;
  if (!event) return <Shell><Status title="Event unavailable" message={message} retry={loadAgain} /></Shell>;
  if ((state === "post-session-loading" || state === "post-session") && session) {
    const closed = event.status === "CLOSED";
    const photoLimit = session.photos_remaining === 0;
    const voiceLimit = !session.voice_note_available;
    return <Shell><div className="space-y-8"><Header title={event.title} /><p className="text-sm text-muted-foreground">Guest: <span className="font-medium text-foreground">{session.guest_name || "Anonymous Guest"}</span></p>{state === "post-session-loading" ? <UsageSkeleton /> : <><>{closed && <Status title="Event closed" message="Your session remains viewable, but new submissions are not accepted." />}</><section aria-labelledby="actions-heading" className="space-y-3"><h2 id="actions-heading" className="font-display text-xl font-semibold">Leave something behind</h2><div className="grid gap-3 sm:grid-cols-2"><PhotoAction closed={closed} limit={photoLimit} photo={photo} preview={photoPreview} state={photoState} message={photoMessage} progress={photoProgress} onChoose={choosePhoto} onRemove={removePhoto} onSubmit={submitPhoto} /><VoiceAction closed={closed} limit={voiceLimit} state={voiceState} voiceUrl={voiceUrl} seconds={voiceSeconds} message={voiceMessage} onRecord={recordVoice} onStop={finishRecording} onReset={resetVoice} onSubmit={submitVoice} /></div></section><section aria-labelledby="usage-heading" className="rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]"><h2 id="usage-heading" className="font-display text-xl font-semibold">Your session</h2><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><p className="rounded-md bg-muted px-3 py-3 tabular-nums">Photos remaining: <strong>{session.photos_remaining}/5</strong></p><p className="rounded-md bg-muted px-3 py-3">Voice note: <strong>{session.voice_note_available ? "Available" : "Already added"}</strong></p></div></section><p role="status" className="text-sm text-muted-foreground">{message}</p></>}</div></Shell>;
  }

  const blocked = state === "closed";
  const failed = recoverable.includes(state);
  return <Shell>
    <Header title={event.title} />
    {blocked && <Status title="Event closed" message="This event remains viewable, but new submissions are not accepted." />}
    {failed && <Status title={state === "invalid" ? "Check your name" : "Could not start"} message={message} />}
    <form onSubmit={start} className="mt-8 space-y-6" aria-busy={state === "starting"}>
      <div className="space-y-2"><label htmlFor="guest-name" className="text-sm font-medium">Your name <span className="font-normal text-muted-foreground">(optional)</span></label><input id="guest-name" name="guest_name" value={name} onChange={(e) => setName(e.target.value)} disabled={blocked || state === "starting"} className="h-12 w-full rounded-md border bg-background px-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-describedby="name-help" /><p id="name-help" className="text-sm text-muted-foreground">Your name applies to submissions in this session.</p></div>
      <button type="submit" disabled={blocked || state === "starting"} className="h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] transition duration-200 ease-out hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45">{state === "starting" ? "Starting…" : "Start"}</button>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">{state === "starting" ? "Starting your session…" : ""}</p>
    </form>
  </Shell>;

  function loadAgain() { window.location.reload(); }
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8"><div className="mx-auto w-full max-w-xl">{children}</div></main>; }
function Header({ title }: { title: string }) { return <header><p className="text-sm font-medium text-muted-foreground">Guest entry</p><h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">{title}</h1></header>; }
function Status({ title, message, retry }: { title: string; message: string; retry?: () => void }) { return <section role="alert" className="mt-8 rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]"><h2 className="font-display text-xl font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{message}</p>{retry && <button type="button" onClick={retry} className="mt-5 h-12 rounded-md bg-primary px-5 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Try again</button>}</section>; }
function Skeleton() { return <div className="space-y-5" aria-hidden="true"><div className="h-4 w-24 animate-pulse rounded bg-muted" /><div className="h-12 w-4/5 animate-pulse rounded bg-muted" /><div className="mt-10 h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div>; }
function UsageSkeleton() { return <div role="status" aria-label="Loading session usage" className="space-y-4"><div className="h-28 animate-pulse rounded-[var(--radius)] bg-muted" /><div className="h-32 animate-pulse rounded-[var(--radius)] bg-muted" /><p className="text-sm text-muted-foreground">Loading your session usage…</p></div>; }
function PlaceholderAction({ label, disabled, detail }: { label: string; disabled: boolean; detail: string }) { return <div className="rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-1)]"><button type="button" disabled={disabled} className="h-12 w-full rounded-md bg-secondary px-4 font-semibold text-secondary-foreground opacity-70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed">{label}</button><p className="mt-3 text-sm text-muted-foreground">{detail}</p></div>; }
function VoiceAction({ closed, limit, state, voiceUrl, seconds, message, onRecord, onStop, onReset, onSubmit }: { closed: boolean; limit: boolean; state: VoiceState; voiceUrl: string; seconds: number; message: string; onRecord: () => void; onStop: () => void; onReset: () => void; onSubmit: () => void }) {
  const disabled = closed || limit || state === "submitting";
  const isError = (state as string) === "error";
  return <div className="rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-1)]"><h3 className="font-semibold">Add a voice note</h3>{limit ? <p className="mt-3 text-sm text-muted-foreground">Voice-note limit reached for this guest session.</p> : closed ? <p className="mt-3 text-sm text-muted-foreground">New submissions are not accepted while this event is closed.</p> : state === "unsupported" ? <p role="alert" className="mt-3 text-sm text-muted-foreground">{message}</p> : state === "idle" || isError ? <div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">Record one voice note, 5–30 seconds. Microphone permission will be requested after you choose Record.</p><button type="button" disabled={disabled} onClick={onRecord} className="min-h-12 w-full rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Record</button>{message && <p role={isError ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p>}</div> : state === "recording" ? <div className="mt-3 space-y-3" role="status" aria-live="polite"><p className="font-semibold"><span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full bg-recording" />Recording</p><p className="font-mono text-2xl tabular-nums">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p><button type="button" onClick={onStop} className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Stop recording</button></div> : <div className="mt-3 space-y-3"><audio controls src={voiceUrl} className="w-full" aria-label="Voice note playback" /><p className="text-sm text-muted-foreground">Duration: <span className="tabular-nums">{seconds}s</span>{seconds < 5 && <strong className="ml-2">Too short</strong>}</p>{seconds < 5 && <p className="text-sm text-muted-foreground">Keep recording for at least 5 seconds where possible, then re-record.</p>}<div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={onSubmit} className="min-h-12 rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">{state === "submitting" ? "Saving…" : "Submit voice note"}</button><button type="button" disabled={state === "submitting"} onClick={onReset} className="min-h-12 rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Re-record</button></div>{state === "submitting" && <p role="status" className="text-sm text-muted-foreground">{message}</p>}{state === "success" && <p role="status" className="text-sm text-success">{message}</p>}{isError && <p role="alert" className="text-sm text-muted-foreground">{message}</p>}</div>}</div>;
}
function PhotoAction({ closed, limit, photo, preview, state, message, progress, onChoose, onRemove, onSubmit }: { closed: boolean; limit: boolean; photo: File | null; preview: string; state: PhotoState; message: string; progress: number; onChoose: (event: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void; onSubmit: () => void }) {
  const disabled = closed || limit || state === "submitting";
  const isError = state === "error";
  return <div className="rounded-[var(--radius)] border bg-card p-4 shadow-[var(--shadow-1)]"><h3 className="font-semibold">Add a photo</h3>{limit ? <p className="mt-3 text-sm text-muted-foreground">Photo limit reached for this guest session.</p> : closed ? <p className="mt-3 text-sm text-muted-foreground">New submissions are not accepted while this event is closed.</p> : !photo ? <div className="mt-3 space-y-2"><p className="text-sm text-muted-foreground">Choose a photo. Camera permission is requested only after you choose camera capture.</p><div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-secondary px-3 text-center text-sm font-semibold focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring"><span>Use camera</span><input className="sr-only" type="file" accept="image/*" capture="environment" onChange={onChoose} /></label><label className="flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-secondary px-3 text-center text-sm font-semibold focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring"><span>Choose a file</span><input className="sr-only" type="file" accept="image/*" onChange={onChoose} /></label></div></div> : <div className="mt-3 space-y-3"><div className="aspect-square overflow-hidden rounded-md bg-muted"><img src={preview} alt="Selected photo preview" className="h-full w-full object-cover" /></div><div className="aspect-[4/3] overflow-hidden rounded-md bg-muted"><img src={preview} alt="" className="h-full w-full object-cover" /></div><p className="text-sm text-muted-foreground">Review your photo before saving.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={onSubmit} className="min-h-12 rounded-md bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">{state === "submitting" ? "Saving…" : "Save photo"}</button><label className="flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-secondary px-4 text-sm font-semibold focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring"><span>Replace</span><input className="sr-only" type="file" accept="image/*" onChange={onChoose} /></label><button type="button" disabled={state === "submitting"} onClick={onRemove} className="min-h-12 rounded-md bg-secondary px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring">Remove</button></div>{state === "submitting" && <progress className="h-2 w-full" value={progress} max="100" aria-label={`Uploading photo, ${progress}%`} />}</div>}{message && <p role={isError ? "alert" : "status"} className="mt-3 text-sm text-muted-foreground">{message}</p>}</div>;
}
