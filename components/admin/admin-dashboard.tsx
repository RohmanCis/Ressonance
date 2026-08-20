"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Image as ImageIcon, Loader2, Mic, Pause, Play, X } from "lucide-react";
import { api, AuthGate, Button, Busy, Event, Shell, Status, Submission } from "./admin-ui";
import { describeDownloadResponse, downloadErrorCodeFromResponse, downloadErrorMessage } from "@/lib/admin-download";

const errorTextMap: Record<string, string> = {
  FORBIDDEN: "You cannot access this media.",
  NOT_FOUND: "This media is no longer available.",
  MEDIA_ACCESS_FAILED: "The private media could not be opened.",
};
function errorText(code: string) {
  return code === "OFFLINE" ? "Media unavailable offline. Retry when connected." : errorTextMap[code] ?? "Media could not be retrieved. Retry this item.";
}

const nameOf = (item: Submission) => item.guest_name?.trim() || "Anonymous Guest";
const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${fmtDate(d)} · ${fmtTime(d)}`;
};
const fmtShort = fmtFull;
const fmtRange = (oldestIso: string, newestIso: string) => {
  const oldest = new Date(oldestIso);
  const newest = new Date(newestIso);
  return `${fmtDate(newest)} · ${fmtTime(oldest)}–${fmtTime(newest)}`;
};
const fmtDuration = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const typeLabel = (item: Submission) => (item.type === "PHOTO" ? "Photo" : "Voice note");

type Group = { ref: string; name: string; session: number | null; items: Submission[] };

function groupByGuest(items: Submission[]): Group[] {
  const map = new Map<string, Submission[]>();
  for (const item of items) {
    const bucket = map.get(item.guest_session_ref);
    if (bucket) bucket.push(item);
    else map.set(item.guest_session_ref, [item]);
  }
  const groups: Group[] = [...map.entries()]
    .map(([ref, groupItems]) => ({
      ref,
      name: nameOf(groupItems[0]),
      session: null,
      items: groupItems.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
    .sort((a, b) => b.items[0].created_at.localeCompare(a.items[0].created_at));
  // Disambiguate same-name sessions: number them chronologically (oldest = 1),
  // shown only when a name occurs more than once.
  const totals = new Map<string, number>();
  for (const g of groups) totals.set(g.name, (totals.get(g.name) ?? 0) + 1);
  const running = new Map<string, number>();
  for (let i = groups.length - 1; i >= 0; i--) {
    const n = (running.get(groups[i].name) ?? 0) + 1;
    running.set(groups[i].name, n);
    groups[i].session = (totals.get(groups[i].name) ?? 0) > 1 ? n : null;
  }
  return groups;
}

const focusRing = "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

const downloadFileName = (item: Submission) => {
  const m = item.mime_type.toLowerCase();
  const ext = m.includes("png") ? "png" : m.includes("jpeg") ? "jpg" : m.includes("webm") ? "webm" : m.includes("mpeg") ? "m4a" : m.includes("quicktime") ? "mov" : "bin";
  const base = item.type === "PHOTO" ? "photo" : "voice-note";
  return `${base}-${item.created_at.slice(0, 10)}.${ext}`;
};

function useDownload(item: Submission) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const start = useCallback(async () => {
    if (inFlight.current) return; // duplicate activation prevention
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/media/${item.id}/download`, { redirect: "follow" });
      if (describeDownloadResponse(res.status) === "error") {
        setError(downloadErrorMessage(await downloadErrorCodeFromResponse(res)));
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = downloadFileName(item);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError(downloadErrorMessage());
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [item]);
  return { busy, error, retry: start };
}

function DownloadButton({ item, name, className = "" }: { item: Submission; name: string; className?: string }) {
  const { busy, error, retry } = useDownload(item);
  return (
    <>
      <button
        type="button"
        aria-label={`Download ${typeLabel(item).toLowerCase()} from ${name}`}
        onClick={retry}
        disabled={busy}
        className={`flex h-11 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition duration-150 ease-out hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Downloading…" : "Download"}
      </button>
      {error && (
        <span className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 p-2">
          <span role="alert" className="text-xs text-muted-foreground">
            <span className="font-semibold">
              {typeLabel(item)} from {name}:{" "}
            </span>
            {error}
          </span>
          <button type="button" onClick={retry} className={`min-h-11 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground ${focusRing}`}>
            Retry
          </button>
        </span>
      )}
    </>
  );
}

function PhotoTile({ item, name, onPreview }: { item: Submission; name: string; onPreview: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // ponytail: eager signed-URL fetch per tile; add IntersectionObserver lazy fetch when event volume grows.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUrl((await api<{ url: string }>(`/api/admin/media/${item.id}/access`)).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [item.id]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--shadow-1)]">
      {error ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-muted p-3 text-center">
          <p role="alert" className="text-xs text-muted-foreground">
            {errorText(error)}
          </p>
          <button type="button" onClick={load} className={`min-h-11 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground ${focusRing}`}>
            Retry
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          disabled={!url}
          aria-label={`Preview photo from ${name}, ${fmtFull(item.created_at)}`}
          className={`block w-full text-left transition duration-150 ease-out enabled:hover:brightness-[.97] disabled:cursor-wait ${focusRing}`}
        >
          <span className="block aspect-square w-full bg-muted">
            {loading && (
              <span role="status" className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only">Loading photo…</span>
              </span>
            )}
            {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
          <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <ImageIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Photo
            </span>
            <time dateTime={item.created_at} className="tabular-nums text-muted-foreground">
              {fmtShort(item.created_at)}
            </time>
          </span>
        </button>
      )}
      <DownloadButton item={item} name={name} className="absolute right-2 top-2" />
    </div>
  );
}

function VoiceTile({ item, name }: { item: Submission; name: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = fmtDuration(item.duration_seconds);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (ready) {
      audio.play().catch(() => {});
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>(`/api/admin/media/${item.id}/access`);
      audio.src = url;
      setReady(true);
      audio.play().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-border bg-card p-3 shadow-[var(--shadow-1)]">
      <audio
        ref={audioRef}
        preload="none"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-label={`${playing ? "Pause" : "Play"} voice note by ${name}${duration ? `, ${item.duration_seconds} seconds` : ""}`}
        className={`flex min-h-11 items-center gap-2 rounded-[10px] bg-secondary px-3 text-sm font-semibold text-secondary-foreground transition duration-150 ease-out hover:brightness-95 disabled:opacity-60 ${focusRing}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
        {loading ? "Loading" : playing ? "Pause" : "Play"}
      </button>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <Mic className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Voice note
        {duration && <span className="tabular-nums text-muted-foreground">{duration}</span>}
      </span>
      <span className="h-1 min-w-16 flex-1 rounded-full bg-muted" aria-hidden="true">
        <span
          className="block h-1 rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </span>
      <time dateTime={item.created_at} className="text-xs tabular-nums text-muted-foreground">
        {fmtShort(item.created_at)}
      </time>
      <DownloadButton item={item} name={name} />
      {loading && (
        <p role="status" className="sr-only">
          Loading voice note…
        </p>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-muted-foreground">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}

function GuestGroup({ group, onPreview }: { group: Group; onPreview: (item: Submission, index: number) => void }) {
  const [open, setOpen] = useState(true);
  const contentId = useId();
  const newest = group.items[0];
  const oldest = group.items[group.items.length - 1];
  const photos = group.items.filter((i) => i.type === "PHOTO");
  const voices = group.items.filter((i) => i.type === "VOICE_NOTE");
  const breakdown = [
    photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : "",
    voices.length ? `${voices.length} voice note${voices.length === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="border-t border-border pt-6 first:border-t-0 first:pt-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-1 text-left ${focusRing}`}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-display text-xl font-semibold tracking-tight">{group.name}</span>
          {group.session !== null && (
            <span className="text-xs font-medium text-muted-foreground">Session {group.session}</span>
          )}
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
            {group.items.length} item{group.items.length === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-muted-foreground">{breakdown}</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {group.items.length > 1 ? fmtRange(oldest.created_at, newest.created_at) : fmtFull(newest.created_at)}
          </span>
        </button>
      </h3>
      {open && (
        <div id={contentId} className="mt-4 grid gap-4">
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((item) => (
                <PhotoTile key={item.id} item={item} name={group.name} onPreview={() => onPreview(item, group.items.indexOf(item))} />
              ))}
            </div>
          )}
          {voices.length > 0 && (
            <div className={photos.length > 0 ? "border-t border-border pt-4" : ""}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
                Voice note{voices.length === 1 ? "" : "s"}
              </p>
              <div className="grid gap-2">
                {voices.map((item) => (
                  <VoiceTile key={item.id} item={item} name={group.name} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PreviewDialog({
  item,
  name,
  index,
  count,
  onClose,
}: {
  item: Submission;
  name: string;
  index: number;
  count: number;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUrl((await api<{ url: string }>(`/api/admin/media/${item.id}/access`)).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [item.id]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const label = `${typeLabel(item)} from ${name}, item ${index + 1} of ${count}`;
  const { busy: downloading, error: downloadError, retry: retryDownload } = useDownload(item);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[14px] border border-border bg-popover shadow-[var(--shadow-3)] transition duration-200 ease-out motion-reduce:transition-none focus:outline-none ${shown ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.08em] text-primary">
              {typeLabel(item)} · {index + 1} of {count}
            </p>
            <h3 className="truncate font-display text-lg font-semibold tracking-tight">{name}</h3>
            <time dateTime={item.created_at} className="text-xs tabular-nums text-muted-foreground">
              {fmtFull(item.created_at)}
            </time>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              secondary
              onClick={retryDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {downloading ? "Downloading…" : "Download"}
            </Button>
            <button
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              className={`flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-3 text-sm font-semibold text-muted-foreground transition duration-150 ease-out hover:text-foreground ${focusRing}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Close
            </button>
          </div>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:pb-6">
          {downloadError && (
            <Status error message={`${typeLabel(item)} from ${name}: ${downloadError}`} action={<Button secondary onClick={retryDownload}>Retry</Button>} />
          )}
          {loading ? (
            <div role="status" className="flex h-64 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading media…
            </div>
          ) : error ? (
            <Status error message={errorText(error)} action={<Button secondary onClick={load}>Retry</Button>} />
          ) : (
            <img src={url} alt={`Photo from ${name}`} className="max-h-[70vh] w-full rounded-md bg-muted object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-label="Loading submissions" className="mt-6 grid gap-8">
      {[0, 1].map((g) => (
        <div key={g} aria-hidden="true">
          <div className="flex items-center gap-3">
            <div className="h-6 w-36 rounded bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="ml-auto h-4 w-28 rounded bg-muted" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((t) => (
              <div key={t} className="aspect-square rounded-[14px] bg-muted" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading submissions…</span>
    </div>
  );
}

export function AdminDashboard({ publicId }: { publicId: string }) {
  const [event, setEvent] = useState<Event | null>(null);
  const [items, setItems] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ item: Submission; name: string; index: number; count: number } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  async function load(search = query) {
    setBusy(true);
    setError("");
    try {
      const e = await api<{ event: Event }>(`/api/admin/events/${publicId}`);
      setEvent(e.event);
      const suffix = search ? `?guest_name=${encodeURIComponent(search)}` : "";
      setItems((await api<{ submissions: Submission[] }>(`/api/admin/events/${publicId}/submissions${suffix}`)).submissions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load("");
  }, [publicId]);

  async function close() {
    setClosing(true);
    setError("");
    try {
      setEvent((await api<{ event: Event }>(`/api/admin/events/${publicId}/close`, { method: "POST" })).event);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClosing(false);
    }
  }

  const groups = useMemo(() => groupByGuest(items), [items]);

  function openPreview(item: Submission, name: string, index: number, count: number) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setPreview({ item, name, index, count });
  }
  function closePreview() {
    setPreview(null);
    const origin = returnFocusRef.current;
    returnFocusRef.current = null;
    window.setTimeout(() => origin?.focus(), 0);
  }

  return (
    <AuthGate>
      <Shell>
        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-primary">Event desk</p>
            {busy && !event ? (
              <Busy label="Loading event" />
            ) : error && !event ? (
              <Status error message={errorText(error)} action={<Button secondary onClick={() => load("")}>Retry</Button>} />
            ) : (
              event && (
                <>
                  <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{event.title}</h1>
                  <p className="mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
                    {event.status === "ACTIVE" ? "Active" : "Closed"}
                  </p>
                  <div className="mt-6 grid gap-2">
                    <Link
                      className={`flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold ${focusRing}`}
                      href={`/admin/events/${publicId}/access`}
                    >
                      Access / QR
                    </Link>
                    {event.status === "ACTIVE" && (
                      <Button disabled={closing} onClick={close}>
                        {closing ? "Closing…" : "Close event"}
                      </Button>
                    )}
                  </div>
                </>
              )
            )}
          </aside>
          <section className="max-w-4xl">
            <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Submissions</p>
                <h2 className="mt-1 text-2xl font-semibold">Newest first</h2>
              </div>
              <form
                className="flex w-full gap-2 sm:max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  load();
                }}
              >
                <label className="sr-only" htmlFor="guest-search">
                  Search by guest name
                </label>
                <input
                  id="guest-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search guest name"
                  className={`h-11 min-w-0 flex-1 rounded-md border bg-card px-3 ${focusRing}`}
                />
                <Button>Search</Button>
              </form>
            </div>
            {error && event && <Status error message={errorText(error)} action={<Button secondary onClick={() => load()}>Retry</Button>} />}
            {busy ? (
              <TimelineSkeleton />
            ) : items.length === 0 ? (
              <div className="mt-6 rounded-[10px] border border-dashed border-border p-10 text-center">
                <h3 className="font-semibold">{query ? "No matching submissions" : "No submissions yet"}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {query ? "Clear or edit the guest-name search." : "New photos and voice notes will appear here."}
                </p>
                {query && (
                  <Button
                    secondary
                    className="mt-4"
                    onClick={() => {
                      setQuery("");
                      load("");
                    }}
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-6 grid gap-8">
                {groups.map((group) => (
                  <GuestGroup
                    key={group.ref}
                    group={group}
                    onPreview={(item, index) => openPreview(item, group.name, index, group.items.length)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
        {preview && (
          <PreviewDialog
            key={preview.item.id}
            item={preview.item}
            name={preview.name}
            index={preview.index}
            count={preview.count}
            onClose={closePreview}
          />
        )}
      </Shell>
    </AuthGate>
  );
}
