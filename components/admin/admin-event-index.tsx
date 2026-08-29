"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, Busy, Button, Event, Shell, Status } from "./admin-ui";
import { AdminPageShell } from "./admin-page-shell";

const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const linkButton = `inline-flex min-h-12 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition duration-fast ${focusRing}`;
const linkGold = `${linkButton} gold-foil-btn h-12 active:scale-[0.98]`;
const linkSecondary = `${linkButton} border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated`;
// Hero-card "Open" demoted to secondary (DESIGN.md §6: one gold primary per
// view — "Create new event" keeps gold-foil-btn).
const linkRowAction = `inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-bg-surface px-4 py-2 text-xs font-medium text-text-primary transition duration-fast hover:bg-bg-elevated ${focusRing}`;
const rowLink = `inline-flex min-h-12 items-center text-xs font-medium text-text-secondary underline-offset-4 transition duration-fast hover:text-text-primary hover:underline ${focusRing}`;

function errorText(code: string) {
  if (code === "OFFLINE") return "Kamu lagi offline. Cek koneksimu, lalu coba lagi.";
  if (code === "RATE_LIMITED") return "Terlalu banyak permintaan. Coba lagi nanti.";
  return "Daftar acaranya gagal dimuat. Aman buat coba lagi.";
}

export function AdminEventIndex() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setEvents(null);
    setError("");
    try {
      setEvents((await api<{ events: Event[] }>("/api/admin/events")).events);
    } catch (e) {
      const code = (e as Error).message;
      // UI_UX §5.5: unauthenticated access redirects to sign-in.
      if (code === "AUTHENTICATION_REQUIRED") {
        router.replace("/admin/sign-in");
        return;
      }
      setError(code);
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);

  const active = events?.find((event) => event.status === "ACTIVE") ?? null;
  const history = events?.filter((event) => event.status !== "ACTIVE") ?? [];

  return (
    <Shell eyebrow="Meja acara">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageShell eyebrow="Daftar acara" title="Acara kamu." />
        <Link href="/admin/events/new" className={linkGold}>
          Buat acara baru
        </Link>
      </div>

      {error ? (
        <Status error message={errorText(error)} action={<Button secondary onClick={load}>Coba lagi</Button>} />
      ) : events === null ? (
        <div className="mt-8">
          <Busy label="Memuat acara" />
        </div>
      ) : events.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">Belum ada acara. Buat acara buat mulai kumpulin foto dan pesan suara.</p>
      ) : (
        <div className="mt-8 space-y-10">
          {active && (
            <section aria-labelledby="active-event-heading">
              <h2 id="active-event-heading" className="text-xs font-medium tracking-[0.04em] text-text-muted">
                Acara aktif
              </h2>
              {/* DESIGN.md §6/§2: ACTIVE hero command card — ambient gold glow behind,
                  gold left-edge marker + live dot retained (e2e-locked visual). */}
              <div className="relative mt-4">
                <div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-accent/10 blur-3xl" />
                <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-border border-l-2 border-l-accent bg-bg-surface p-5 sm:p-6">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted">
                      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" />
                      Aktif
                    </p>
                    <h3 className="mt-1.5 truncate font-display text-2xl font-semibold leading-tight tracking-tight text-text-primary">{active.title}</h3>
                    {active.created_at && (
                      <p className="mt-1.5 font-mono text-xs text-text-muted">
                        Dibuka{" "}
                        <time dateTime={active.created_at} className="tabular-nums">
                          {fmtFull(active.created_at)}
                        </time>
                      </p>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Link href={`/admin/events/${active.public_id}`} className={linkRowAction}>
                      Buka
                    </Link>
                    <Link href={`/admin/events/${active.public_id}/access`} className={linkSecondary}>
                      Akses / QR
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}
          {history.length > 0 && (
            <section aria-labelledby="past-events-heading">
              <h2 id="past-events-heading" className="text-xs font-medium tracking-[0.04em] text-text-muted">
                Acara sebelumnya
              </h2>
              <ul className="mt-3 grid gap-3">
                {history.map((event) => (
                  <li key={event.public_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-surface/60 px-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold text-text-primary">{event.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-text-muted">
                        {event.created_at && (
                          <>
                            Dibuka{" "}
                            <time dateTime={event.created_at} className="tabular-nums">
                              {fmtFull(event.created_at)}
                            </time>
                          </>
                        )}
                        {event.closed_at && (
                          <>
                            {" · "}Ditutup{" "}
                            <time dateTime={event.closed_at} className="tabular-nums">
                              {fmtFull(event.closed_at)}
                            </time>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-text-muted">Selesai</span>
                      <Link href={`/admin/events/${event.public_id}`} className={rowLink}>
                        Buka
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
