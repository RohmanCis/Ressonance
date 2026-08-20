"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, Busy, Button, Event, Shell, Status } from "./admin-ui";

const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const linkButton = `inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 py-2 text-sm font-semibold transition duration-fast ${focusRing}`;
const linkGold = `${linkButton} bg-accent text-on-accent hover:brightness-105`;
const linkQuiet = `${linkButton} border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated`;

function errorText(code: string) {
  if (code === "OFFLINE") return "You appear offline. Check your connection, then retry.";
  if (code === "RATE_LIMITED") return "Too many requests. Try again later.";
  return "The event list could not be loaded. Retry safely.";
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
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-accent">Event index</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">Your events.</h1>
        </div>
        <Link href="/admin/events/new" className={linkGold}>
          Create new event
        </Link>
      </div>

      {error ? (
        <Status error message={errorText(error)} action={<Button secondary onClick={load}>Retry</Button>} />
      ) : events === null ? (
        <div className="mt-8">
          <Busy label="Loading events" />
        </div>
      ) : events.length === 0 ? (
        <div className="mt-8 rounded-[10px] border border-dashed border-border p-10 text-center">
          <h2 className="font-semibold text-text-primary">No events yet</h2>
          <p className="mt-2 text-sm text-text-muted">Create an event to start collecting photos and voice notes.</p>
          <Link href="/admin/events/new" className={`${linkGold} mt-4`}>
            Create event
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10">
          {active && (
            <section aria-labelledby="active-event-heading">
              <h2 id="active-event-heading" className="text-xs font-semibold uppercase tracking-[.08em] text-text-muted">
                Active event
              </h2>
              {/* DESIGN.md §6: ACTIVE prominent via gold left-edge marker. */}
              <div className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-[10px] border border-border border-l-2 border-l-accent bg-bg-surface p-4 sm:p-6">
                <div className="min-w-0">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">Active</span>
                  <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text-primary">{active.title}</h3>
                  {active.created_at && (
                    <p className="mt-1 text-sm text-text-muted">
                      Opened{" "}
                      <time dateTime={active.created_at} className="font-mono tabular-nums">
                        {fmtFull(active.created_at)}
                      </time>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${active.public_id}`} className={linkQuiet}>
                    Open
                  </Link>
                  <Link href={`/admin/events/${active.public_id}/access`} className={linkQuiet}>
                    Access / QR
                  </Link>
                </div>
              </div>
            </section>
          )}
          {history.length > 0 && (
            <section aria-labelledby="past-events-heading">
              <h2 id="past-events-heading" className="text-xs font-semibold uppercase tracking-[.08em] text-text-muted">
                Past events
              </h2>
              <ul className="mt-3 grid gap-3">
                {history.map((event) => (
                  <li
                    key={event.public_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-border bg-bg-surface p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary">{event.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {event.created_at && (
                          <>
                            Opened{" "}
                            <time dateTime={event.created_at} className="font-mono tabular-nums">
                              {fmtFull(event.created_at)}
                            </time>
                          </>
                        )}
                        {event.closed_at && (
                          <>
                            {" · "}Closed{" "}
                            <time dateTime={event.closed_at} className="font-mono tabular-nums">
                              {fmtFull(event.closed_at)}
                            </time>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-text-muted">Closed</span>
                    <Link href={`/admin/events/${event.public_id}`} className={linkQuiet}>
                      Open
                    </Link>
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
