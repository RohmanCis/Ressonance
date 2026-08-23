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
const rowLink = `inline-flex min-h-12 items-center text-xs font-medium text-text-secondary underline-offset-4 transition duration-fast hover:text-text-primary hover:underline ${focusRing}`;

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
    <Shell eyebrow="Event desk">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageShell eyebrow="Event index" title="Your events." />
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
        <p className="py-8 text-center text-sm text-text-muted">No events yet. Create an event to start collecting photos and voice notes.</p>
      ) : (
        <div className="mt-8 space-y-10">
          {active && (
            <section aria-labelledby="active-event-heading">
              <h2 id="active-event-heading" className="text-xs font-medium tracking-[0.04em] text-text-muted">
                Active event
              </h2>
              {/* DESIGN.md §6: ACTIVE prominent via gold left-edge marker + surface wash. */}
              <div className="mt-3 divide-y divide-border">
                <div className="-mx-4 flex items-center justify-between gap-3 rounded-xl border-l-2 border-l-accent bg-bg-surface/40 px-4 py-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg font-semibold text-text-primary">{active.title}</h3>
                    {active.created_at && (
                      <p className="mt-0.5 font-mono text-xs text-text-muted">
                        Opened{" "}
                        <time dateTime={active.created_at} className="tabular-nums">
                          {fmtFull(active.created_at)}
                        </time>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="inline-flex items-center">
                      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-accent" />
                      <span className="ml-1.5 text-xs text-text-muted">Active</span>
                    </span>
                    <Link href={`/admin/events/${active.public_id}`} className={rowLink}>
                      Open
                    </Link>
                    <Link href={`/admin/events/${active.public_id}/access`} className={rowLink}>
                      Access / QR
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}
          {history.length > 0 && (
            <section aria-labelledby="past-events-heading">
              <h2 id="past-events-heading" className="text-xs font-medium tracking-[0.04em] text-text-muted">
                Past events
              </h2>
              <ul className="mt-3 divide-y divide-border">
                {history.map((event) => (
                  <li key={event.public_id} className="flex items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold text-text-primary">{event.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-text-muted">
                        {event.created_at && (
                          <>
                            Opened{" "}
                            <time dateTime={event.created_at} className="tabular-nums">
                              {fmtFull(event.created_at)}
                            </time>
                          </>
                        )}
                        {event.closed_at && (
                          <>
                            {" · "}Closed{" "}
                            <time dateTime={event.closed_at} className="tabular-nums">
                              {fmtFull(event.closed_at)}
                            </time>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-text-muted">Closed</span>
                      <Link href={`/admin/events/${event.public_id}`} className={rowLink}>
                        Open
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
