"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { AdminInput } from "./admin-input";
import { AdminPageShell } from "./admin-page-shell";

export type Event = { public_id: string; title: string; status: "ACTIVE" | "CLOSED"; created_at?: string; closed_at?: string | null };
export type Submission = { id: string; type: "PHOTO" | "VOICE_NOTE"; guest_name?: string | null; guest_session_ref: string; created_at: string; mime_type: string; file_size: number; duration_seconds?: number | null };

const errorText: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign-in is required.", AUTHENTICATION_FAILED: "Those credentials were not accepted.", FORBIDDEN: "This event is not available to this account.", NOT_FOUND: "This event is no longer available.", RATE_LIMITED: "Too many requests. Try again later.", ACTIVE_EVENT_EXISTS: "An active event already exists. Open it instead.", EVENT_ALREADY_CLOSED: "The event is already closed.", INVALID_EVENT_STATE: "The event cannot be changed right now.", INVALID_INPUT: "Check the highlighted field and try again.", MEDIA_ACCESS_FAILED: "This media could not be opened.", INTERNAL_ERROR: "The service could not complete that request.",
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: "same-origin" }); } catch { throw new Error("OFFLINE"); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const code = body?.error?.code ?? "INTERNAL_ERROR"; throw new Error(code); }
  return body as T;
}

// DESIGN.md §6: admin chrome on dark tokens — bg-base page, hairline header, gold only on primary actions.
export function Shell({ children, title = "Admin", eyebrow }: { children: ReactNode; title?: string; eyebrow?: string }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg-base px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-text-primary sm:px-8">
      {/* 1. AMBIENT GLOW LAYER 1 (Top-Right Amber Orb) — PreSession baseline */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-[100px] animate-ambient-1" />
      {/* 2. AMBIENT GLOW LAYER 2 (Bottom-Left Warm Bronze Orb) */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[110px] animate-ambient-2" />
      {/* 3. FILM GRAIN OVERLAY */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 film-grain" />
      {/* 4. CONTENT WRAPPER */}
      <div className="relative z-10 mx-auto w-full max-w-[90rem]">
        <header className="mb-10 flex items-center justify-between border-b border-border pb-5">
          <Link href="/admin" className="font-display text-xl font-semibold tracking-tight text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{title}</Link>
          {eyebrow && <span className="text-xs font-medium tracking-[0.04em] text-text-muted">{eyebrow}</span>}
        </header>
        {children}
      </div>
    </main>
  );
}

export function Status({ message, error = false, action }: { message: string; error?: boolean; action?: ReactNode }) {
  return <div role={error ? "alert" : "status"} className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated/90 p-4 text-sm ${error ? "text-error" : "text-success"}`}><span>{message}</span>{action}</div>;
}

export function Busy({ label = "Loading" }) {
  return (
    <div role="status" aria-label={label} className="flex animate-pulse gap-2">
      <div className="h-4 w-32 bg-bg-surface/60" />
      <div className="h-3 w-48 bg-bg-surface/60" />
    </div>
  );
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  useEffect(() => { api("/api/admin/me").then(() => setState("ok")).catch(() => setState("no")); }, []);
  if (state === "loading") return <Shell><Busy label="Checking access" /></Shell>;
  if (state === "no") return <Shell><Status error message="Your admin session is unavailable." action={<Link className="inline-flex min-h-12 items-center rounded-lg border border-border bg-bg-surface px-4 py-2 font-semibold text-text-primary transition duration-fast hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href="/admin/sign-in">Return to sign-in</Link>} /></Shell>;
  return <>{children}</>;
}

export function Button({ children, secondary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} className={`${secondary ? "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated" : "gold-foil-btn active:scale-[0.98]"} min-h-12 h-12 rounded-lg px-4 py-2 text-sm font-semibold transition duration-fast disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${props.className ?? ""}`}>{children}</button>;
}

export function AdminCreateEvent() {
  const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const body = await api<{ event: Event; public_url: string }>("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setMessage(`Created “${body.event.title}”.`); window.location.href = `/admin/events/${body.event.public_id}`; } catch (e) { setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "You appear offline. Retry when connected." : "Could not create the event. Retry safely.")); setBusy(false); } }
  return <AuthGate><Shell eyebrow="Event desk"><div className="mx-auto max-w-2xl"><AdminPageShell eyebrow="New event" title="Create a new event."><p className="mt-3 text-sm text-text-secondary leading-relaxed">Create one active event. You can close it when the day is complete.</p><form onSubmit={submit} className="mt-8 rounded-2xl border border-border bg-bg-surface p-6"><AdminInput id="event-title" label="Event title" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Summer party" />{error && <Status error message={error} action={error.includes("already") ? <Link href="/admin" className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Find existing event</Link> : undefined} />}{message && <Status message={message} />}<Button disabled={busy} className="mt-6">{busy ? "Creating…" : "Create event"}</Button></form></AdminPageShell></div></Shell></AuthGate>;
}
