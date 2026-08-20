"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";

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
export function Shell({ children, title = "Admin", eyebrow = "Event desk" }: { children: ReactNode; title?: string; eyebrow?: string }) {
  return <main className="min-h-screen bg-bg-base px-4 py-6 text-text-primary sm:px-8 lg:px-12"><div className="mx-auto max-w-[90rem]"> <header className="mb-10 flex items-center justify-between border-b border-border pb-5"><Link href="/admin" className="font-display text-xl font-semibold tracking-tight text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{title}</Link><span className="text-xs font-medium uppercase tracking-[.12em] text-text-muted">{eyebrow}</span></header>{children}</div></main>;
}

export function Status({ message, error = false, action }: { message: string; error?: boolean; action?: ReactNode }) {
  return <div role={error ? "alert" : "status"} className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4 text-sm text-text-primary ${error ? "border-error/40 bg-error/10" : "border-success/40 bg-success/10"}`}><span>{message}</span>{action}</div>;
}

export function Busy({ label = "Loading" }) { return <div role="status" className="rounded-[10px] border border-border bg-bg-surface p-8 text-sm text-text-muted">{label}…</div>; }
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  useEffect(() => { api("/api/admin/me").then(() => setState("ok")).catch(() => setState("no")); }, []);
  if (state === "loading") return <Shell><Busy label="Checking access" /></Shell>;
  if (state === "no") return <Shell><Status error message="Your admin session is unavailable." action={<Link className="inline-flex min-h-11 items-center rounded-[10px] border border-border bg-bg-surface px-4 py-2 font-semibold text-text-primary transition duration-fast hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href="/admin/sign-in">Return to sign-in</Link>} /></Shell>;
  return <>{children}</>;
}

export function Button({ children, secondary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} className={`${secondary ? "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated" : "bg-accent text-on-accent hover:brightness-105"} min-h-11 rounded-[10px] px-4 py-2 text-sm font-semibold transition duration-fast disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${props.className ?? ""}`}>{children}</button>;
}

export function AdminCreateEvent() {
  const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const body = await api<{ event: Event; public_url: string }>("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setMessage(`Created “${body.event.title}”.`); window.location.href = `/admin/events/${body.event.public_id}`; } catch (e) { setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "You appear offline. Retry when connected." : "Could not create the event. Retry safely.")); setBusy(false); } }
  return <AuthGate><Shell><div className="mx-auto max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.12em] text-accent">New event</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">Create a new event.</h1><p className="mt-3 text-text-secondary">Create one active event. You can close it when the day is complete.</p><form onSubmit={submit} className="mt-8 rounded-[10px] border border-border bg-bg-surface p-6"><label className="block text-sm font-semibold text-text-primary" htmlFor="event-title">Event title<input id="event-title" required value={title} onChange={e => setTitle(e.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-bg-base px-3 text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" placeholder="Summer party" /></label>{error && <Status error message={error} action={error.includes("already") ? <Link href="/admin" className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Find existing event</Link> : undefined} />}{message && <Status message={message} />}<Button disabled={busy} className="mt-6">{busy ? "Creating…" : "Create event"}</Button></form></div></Shell></AuthGate>;
}
