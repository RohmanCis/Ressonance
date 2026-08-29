"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { AdminInput } from "./admin-input";
import { AdminPageShell } from "./admin-page-shell";
import { AmbientBackdrop } from "@/components/guest/ambient-backdrop";

export type Event = { public_id: string; title: string; status: "ACTIVE" | "CLOSED"; created_at?: string; closed_at?: string | null };
export type Submission = { id: string; type: "PHOTO" | "VOICE_NOTE"; guest_name?: string | null; guest_session_ref: string; created_at: string; mime_type: string; file_size: number; duration_seconds?: number | null };

const errorText: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Kamu harus masuk dulu.", AUTHENTICATION_FAILED: "Email atau kata sandinya belum cocok.", FORBIDDEN: "Acara ini nggak bisa diakses akun ini.", NOT_FOUND: "Acara ini udah nggak ada.", RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi nanti.", ACTIVE_EVENT_EXISTS: "Udah ada acara aktif. Buka yang itu aja.", EVENT_ALREADY_CLOSED: "Acaranya udah ditutup.", INVALID_EVENT_STATE: "Acara nggak bisa diubah sekarang.", INVALID_INPUT: "Cek kolom yang disorot, lalu coba lagi.", MEDIA_ACCESS_FAILED: "Media ini nggak bisa dibuka.", INTERNAL_ERROR: "Layanan nggak bisa menyelesaikan permintaan itu.",
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
      {/* Ambient orbs + grain (print-hidden) — PreSession baseline (DESIGN.md §2) */}
      <AmbientBackdrop printHidden />
      {/* CONTENT WRAPPER */}
      <div className="relative z-10 mx-auto w-full max-w-[90rem] min-h-[60vh]">
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

export function Busy({ label = "Memuat" }) {
  return (
    <div role="status" aria-label={label} className="flex animate-pulse gap-2">
      <div className="h-4 w-32 rounded bg-bg-surface/60" />
      <div className="h-3 w-48 rounded bg-bg-surface/60" />
    </div>
  );
}
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  useEffect(() => { api("/api/admin/me").then(() => setState("ok")).catch(() => setState("no")); }, []);
  if (state === "loading") return <Shell><Busy label="Mengecek akses" /></Shell>;
  if (state === "no") return <Shell><Status error message="Sesi adminmu nggak bisa dibuka." action={<Link className="inline-flex min-h-12 items-center rounded-lg border border-border bg-bg-surface px-4 py-2 font-semibold text-text-primary transition duration-fast hover:bg-bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href="/admin/sign-in">Kembali ke halaman masuk</Link>} /></Shell>;
  return <>{children}</>;
}

export function Button({ children, secondary = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} className={`${secondary ? "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated" : "gold-foil-btn active:scale-[0.98]"} min-h-12 h-12 rounded-lg px-4 py-2 text-sm font-semibold transition duration-fast disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${props.className ?? ""}`}>{children}</button>;
}

export function AdminCreateEvent() {
  const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const body = await api<{ event: Event; public_url: string }>("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); setMessage(`Acara “${body.event.title}” udah dibuat.`); window.location.href = `/admin/events/${body.event.public_id}`; } catch (e) { setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "Kamu lagi offline. Coba lagi pas konek." : "Acaranya gagal dibuat. Aman buat coba lagi.")); setBusy(false); } }
  return <AuthGate><Shell eyebrow="Meja acara"><div className="mx-auto max-w-2xl"><AdminPageShell eyebrow="Acara baru" title="Buat acara baru."><p className="mt-3 text-sm text-text-secondary leading-relaxed">Cuma bisa ada satu acara aktif. Tutup aja kalau acaranya udah selesai.</p><form onSubmit={submit} className="mt-8 rounded-2xl border border-border bg-bg-surface p-6"><AdminInput id="event-title" label="Nama acara" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Resepsi R & C" />{error && <Status error message={error} action={error.toLowerCase().includes("udah ada") ? <Link href="/admin" className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Lihat acara yang ada</Link> : undefined} />}{message && <Status message={message} />}<Button disabled={busy} className="mt-6">{busy ? "Membuat…" : "Buat acara"}</Button></form></AdminPageShell></div></Shell></AuthGate>;
}
