"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";

export type Event = { public_id: string; title: string; status: "ACTIVE" | "CLOSED"; created_at?: string; closed_at?: string | null };
export type Submission = { id: string; type: "PHOTO" | "VOICE_NOTE"; guest_name?: string | null; created_at: string; mime_type: string; file_size: number; duration_seconds?: number | null };

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

export function Shell({ children, title = "Memory table", eyebrow = "Event archive" }: { children: ReactNode; title?: string; eyebrow?: string }) {
  return <main className="min-h-screen bg-background px-4 py-6 sm:px-8 lg:px-12"><div className="mx-auto max-w-[90rem]"> <header className="mb-10 flex items-center justify-between border-b border-border pb-5"><Link href="/admin" className="font-display text-xl font-semibold tracking-tight">{title}</Link><span className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">{eyebrow}</span></header>{children}</div></main>;
}

export function Status({ message, error = false, action }: { message: string; error?: boolean; action?: ReactNode }) {
  return <div role={error ? "alert" : "status"} className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4 text-sm ${error ? "border-destructive/40 bg-destructive/10" : "border-success/40 bg-[color:var(--success-surface)]"}`}><span>{message}</span>{action}</div>;
}

export function Busy({ label = "Loading" }) { return <div role="status" className="rounded-[10px] border border-border bg-card p-8 text-sm text-muted-foreground">{label}…</div>; }
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  useEffect(() => { api("/api/admin/me").then(() => setState("ok")).catch(() => setState("no")); }, []);
  if (state === "loading") return <Shell><Busy label="Checking access" /></Shell>;
  if (state === "no") return <Shell><Status error message="Your admin session is unavailable." action={<Link className="min-h-11 rounded-md border px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring" href="/admin/sign-in">Return to sign-in</Link>} /></Shell>;
  return <>{children}</>;
}

export function Button({ children, secondary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} className={`${secondary ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"} min-h-11 rounded-[10px] px-4 py-2 text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${props.className ?? ""}`}>{children}</button>;
}

export function AdminSignIn() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await api("/api/admin/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); window.location.href = "/admin/events/new"; } catch (e) { setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "You appear offline. Check your connection, then retry." : "Sign-in failed. Check your details and retry.")); setBusy(false); } }
  return <Shell title="Memory table" eyebrow="Admin sign-in"><div className="mx-auto max-w-md pt-8"><p className="mb-3 text-xs font-semibold uppercase tracking-[.12em] text-primary">A clear archive for a day worth keeping</p><h1 className="font-display text-4xl font-semibold tracking-tight">Open your event desk.</h1><p className="mt-3 text-muted-foreground">Sign in to create an event, share its access card, and review every submission.</p><form onSubmit={submit} className="mt-8 rounded-[10px] border border-border bg-card p-6 shadow-[var(--shadow-1)]"><label className="block text-sm font-semibold" htmlFor="email">Email<input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label><label className="mt-4 block text-sm font-semibold" htmlFor="password">Password<input id="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label>{error && <Status error message={error} />}<Button disabled={busy} className="mt-6 w-full">{busy ? "Signing in…" : "Sign in"}</Button></form></div></Shell>;
}

export function AdminCreateEvent() {
  const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const body = await api<{ event: Event; public_url: string }>("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setMessage(`Created “${body.event.title}”.`); window.location.href = `/admin/events/${body.event.public_id}`; } catch (e) { setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "You appear offline. Retry when connected." : "Could not create the event. Retry safely.")); setBusy(false); } }
  return <AuthGate><Shell><div className="mx-auto max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.12em] text-primary">New event</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Start a fresh page in the archive.</h1><p className="mt-3 text-muted-foreground">Create one active event. You can close it when the day is complete.</p><form onSubmit={submit} className="mt-8 rounded-[10px] border border-border bg-card p-6 shadow-[var(--shadow-1)]"><label className="block text-sm font-semibold" htmlFor="event-title">Event title<input id="event-title" required value={title} onChange={e => setTitle(e.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-3 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Summer party" /></label>{error && <Status error message={error} action={error.includes("already") ? <Link href="/admin" className="underline">Find existing event</Link> : undefined} />}{message && <Status message={message} />}<Button disabled={busy} className="mt-6">{busy ? "Creating…" : "Create event"}</Button></form></div></Shell></AuthGate>;
}
