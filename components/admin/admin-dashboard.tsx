"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Image as ImageIcon, Loader2, Mic, Pause, Play, X } from "lucide-react";
import { api, AuthGate, Button, Busy, Event, Shell, Status, Submission } from "./admin-ui";
import { AdminInput } from "./admin-input";
import { describeDownloadResponse, downloadErrorCodeFromResponse, downloadErrorMessage } from "@/lib/admin-download";
import { useFocusTrap } from "@/hooks/use-focus-trap";

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

type MediaFilter = "ALL" | "PHOTO" | "VOICE_NOTE";
const MEDIA_SEGMENTS: { value: MediaFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PHOTO", label: "Photos" },
  { value: "VOICE_NOTE", label: "Voice" },
];
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

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

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const quietButton = "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated";
// Decorative static waveform behind the voice progress bar (fixed heights, muted).
const WAVEFORM_BARS = [0.35, 0.6, 0.45, 0.8, 1, 0.7, 0.5, 0.9, 0.65, 0.4, 0.75, 0.55, 0.85, 0.5, 0.3, 0.62, 0.9, 0.7, 0.45, 0.66, 0.82, 0.52, 0.36, 0.58];

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
        className={`flex h-12 items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 text-xs font-semibold text-text-secondary transition duration-fast ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Downloading…" : "Download"}
      </button>
      {error && (
        <span className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated/90 p-2">
          <span role="alert" className="text-xs text-error">
            <span className="font-semibold text-text-primary">
              {typeLabel(item)} from {name}:{" "}
            </span>
            {error}
          </span>
          <button type="button" onClick={retry} className={`min-h-12 rounded-md px-3 text-xs font-semibold transition duration-fast ${quietButton} ${focusRing}`}>
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
    <div className="relative overflow-hidden rounded-lg border border-border bg-bg-surface">
      {error ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-bg-elevated p-3 text-center">
          <p role="alert" className="text-xs text-text-muted">
            {errorText(error)}
          </p>
          <button type="button" onClick={load} className={`min-h-12 rounded-md px-3 text-xs font-semibold transition duration-fast ${quietButton} ${focusRing}`}>
            Retry
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          disabled={!url}
          aria-label={`Preview photo from ${name}, ${fmtFull(item.created_at)}`}
          className={`group block w-full text-left transition duration-fast ease-out disabled:cursor-wait ${focusRing}`}
        >
          <span className="block aspect-square w-full overflow-hidden bg-bg-elevated">
            {loading && (
              <span role="status" className="flex h-full w-full items-center justify-center text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only">Loading photo…</span>
              </span>
            )}
            {url && (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-base ease-out motion-reduce:transition-none motion-safe:group-hover:scale-[1.03]"
              />
            )}
          </span>
          <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary">
              <ImageIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              Photo
            </span>
            <time dateTime={item.created_at} className="font-mono tabular-nums text-text-muted">
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-bg-surface/90 p-4">
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
        className={`flex min-h-12 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition duration-fast ease-out disabled:opacity-60 ${quietButton} ${focusRing}`}
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
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary">
        <Mic className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        Voice note
        {duration && <span className="font-mono tabular-nums text-text-muted">{duration}</span>}
      </span>
      <span className="relative flex h-8 min-w-24 flex-1 items-center justify-between gap-[3px]" aria-hidden="true">
        {WAVEFORM_BARS.map((height, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full bg-text-muted/30" style={{ height: `${Math.round(height * 100)}%` }} />
        ))}
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
          <span
            className="block h-full w-full origin-left rounded-full bg-accent transition-transform duration-[var(--motion-base)]"
            style={{ transform: `scaleX(${progress})` }}
          />
        </span>
      </span>
      <time dateTime={item.created_at} className="font-mono text-xs tabular-nums text-text-muted">
        {fmtShort(item.created_at)}
      </time>
      <DownloadButton item={item} name={name} />
      {loading && (
        <p role="status" className="sr-only">
          Loading voice note…
        </p>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-text-muted">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}

function GuestGroup({ group, onPreview }: { group: Group; onPreview: (item: Submission) => void }) {
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
    <section className="rounded-3xl border border-border bg-bg-surface/90 p-5 backdrop-blur-sm">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-1 text-left ${focusRing}`}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-semibold text-text-secondary">
            {initialsOf(group.name)}
          </span>
          <span className="text-lg font-semibold text-text-primary">{group.name}</span>
          {group.session !== null && (
            <span className="text-xs font-medium text-text-muted">Session {group.session}</span>
          )}
          <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums text-text-secondary">
            {group.items.length} item{group.items.length === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-text-muted">{breakdown}</span>
          <span className="ml-auto font-mono text-xs tabular-nums text-text-muted">
            {group.items.length > 1 ? fmtRange(oldest.created_at, newest.created_at) : fmtFull(newest.created_at)}
          </span>
        </button>
      </h3>
      {open && (
        <div id={contentId} className="mt-4 grid gap-4">
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((item) => (
                <PhotoTile key={item.id} item={item} name={group.name} onPreview={() => onPreview(item)} />
              ))}
            </div>
          )}
          {voices.length > 0 && (
            <div className={photos.length > 0 ? "border-t border-border pt-4" : ""}>
              <p className="mb-2 text-xs font-medium tracking-[0.04em] text-text-muted">
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
  photos,
  name,
  index,
  onClose,
  onNavigate,
}: {
  photos: Submission[];
  name: string;
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const item = photos[index];
  const count = photos.length;
  const panelRef = useRef<HTMLDivElement>(null);
  const trapFocus = useFocusTrap(panelRef);
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
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      onNavigate(index - 1);
      return;
    }
    if (e.key === "ArrowRight" && index < count - 1) {
      e.preventDefault();
      onNavigate(index + 1);
      return;
    }
    trapFocus(e);
  }

  const label = `${typeLabel(item)} from ${name}, photo ${index + 1} of ${count}`;
  const { busy: downloading, error: downloadError, retry: retryDownload } = useDownload(item);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 transition-opacity duration-base ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
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
        className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-bg-elevated shadow-2xl transition duration-base ease-out motion-reduce:transition-none focus:outline-none ${shown ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium tracking-[0.04em] text-text-muted">
              {typeLabel(item)} · {index + 1} of {count}
            </p>
            <h3 className="truncate text-lg font-semibold text-text-primary">{name}</h3>
            <time dateTime={item.created_at} className="font-mono text-xs tabular-nums text-text-muted">
              {fmtFull(item.created_at)}
            </time>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {count > 1 && (
              <div role="group" aria-label="Navigate photos" className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => onNavigate(index - 1)}
                  disabled={index === 0}
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-surface text-text-secondary transition duration-fast ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => onNavigate(index + 1)}
                  disabled={index === count - 1}
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-surface text-text-secondary transition duration-fast ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
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
              className={`flex h-12 items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 text-sm font-semibold text-text-secondary transition duration-fast ease-out hover:text-text-primary ${focusRing}`}
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
            <div role="status" className="flex h-64 items-center justify-center rounded-md bg-bg-surface text-sm text-text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading media…
            </div>
          ) : error ? (
            <Status error message={errorText(error)} action={<Button secondary onClick={load}>Retry</Button>} />
          ) : (
            <img src={url} alt={`Photo from ${name}`} className="max-h-[70vh] w-full rounded-md bg-bg-surface object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-label="Loading submissions" className="mt-6 grid animate-pulse gap-6">
      {[0, 1].map((g) => (
        <div key={g} aria-hidden="true" className="rounded-3xl border border-border bg-bg-surface/90 p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-bg-elevated" />
            <div className="h-6 w-36 rounded bg-bg-elevated" />
            <div className="h-5 w-16 rounded-full bg-bg-elevated" />
            <div className="ml-auto h-4 w-28 rounded bg-bg-elevated" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((t) => (
              <div key={t} className="aspect-square rounded-lg bg-bg-elevated" />
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
  const [preview, setPreview] = useState<{ photos: Submission[]; name: string; index: number } | null>(null);
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

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("ALL");
  // Derived metrics from the loaded submissions only — no extra fetch (task spec).
  const metrics = useMemo(() => {
    const guests = new Set<string>();
    let photos = 0;
    let voices = 0;
    for (const item of items) {
      guests.add(item.guest_session_ref);
      if (item.type === "PHOTO") photos += 1;
      else voices += 1;
    }
    return { guests: guests.size, photos, voices, media: items.length };
  }, [items]);
  // Segmented media filter applied client-side before grouping.
  const visibleItems = useMemo(
    () => (mediaFilter === "ALL" ? items : items.filter((item) => item.type === mediaFilter)),
    [items, mediaFilter],
  );
  const groups = useMemo(() => groupByGuest(visibleItems), [visibleItems]);

  function openPreview(item: Submission, group: Group) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // Lightbox navigates photos only, newest-first within the guest group.
    const photos = group.items.filter((i) => i.type === "PHOTO");
    setPreview({ photos, name: group.name, index: photos.indexOf(item) });
  }
  function closePreview() {
    setPreview(null);
    const origin = returnFocusRef.current;
    returnFocusRef.current = null;
    window.setTimeout(() => origin?.focus(), 0);
  }

  return (
    <AuthGate>
      <Shell eyebrow="Event desk">
        <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            {busy && !event ? (
              <Busy label="Loading event" />
            ) : error && !event ? (
              <Status error message={errorText(error)} action={<Button secondary onClick={() => load("")}>Retry</Button>} />
            ) : (
              event && (
                <>
                  <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary">{event.title}</h1>
                  <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${event.status === "ACTIVE" ? "border-accent/40 bg-accent-soft text-accent" : "border-border text-text-muted"}`}>
                    {event.status === "ACTIVE" ? "Active" : "Closed"}
                  </p>
                  <div className="mt-6 grid gap-2">
                    <Link
                      className={`flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold transition duration-fast ${quietButton} ${focusRing}`}
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
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { label: "Guests", value: metrics.guests },
                  { label: "Photos", value: metrics.photos },
                  { label: "Voice notes", value: metrics.voices },
                  { label: "Media", value: metrics.media },
                ] as const
              ).map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-bg-surface p-4">
                  <p className="font-mono text-2xl tabular-nums text-text-primary">{stat.value}</p>
                  <p className="mt-1 text-xs text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium tracking-[0.04em] text-text-muted">Submissions</p>
                <h2 className="mt-1 text-xl font-semibold text-text-primary">Newest first</h2>
              </div>
              <form
                className="w-full sm:max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  load();
                }}
              >
                <AdminInput
                  id="guest-search"
                  label="Search by guest name"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search guest name"
                  autoComplete="off"
                />
                <Button secondary className="mt-3">
                  Search
                </Button>
              </form>
            </div>
            <div role="group" aria-label="Filter by media type" className="mt-4 inline-flex rounded-lg border border-border bg-bg-surface p-1">
              {MEDIA_SEGMENTS.map((segment) => {
                const selected = mediaFilter === segment.value;
                return (
                  <button
                    key={segment.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMediaFilter(segment.value)}
                    className={`min-h-11 rounded-md px-4 text-sm font-semibold transition duration-fast ${selected ? "bg-bg-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"} ${focusRing}`}
                  >
                    {segment.label}
                  </button>
                );
              })}
            </div>
            {error && event && <Status error message={errorText(error)} action={<Button secondary onClick={() => load()}>Retry</Button>} />}
            {busy ? (
              <TimelineSkeleton />
            ) : groups.length === 0 ? (
              <p className="mt-6 text-center text-sm text-text-muted">
                {query
                  ? "No matching submissions. Clear or edit the guest-name search."
                  : mediaFilter !== "ALL"
                    ? `No ${mediaFilter === "PHOTO" ? "photos" : "voice notes"} match this filter.`
                    : "New photos and voice notes will appear here."}
              </p>
            ) : (
              <div className="mt-6 grid gap-6">
                {groups.map((group) => (
                  <GuestGroup
                    key={group.ref}
                    group={group}
                    onPreview={(item) => openPreview(item, group)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
        {preview && (
          <PreviewDialog
            key={preview.photos[preview.index].id}
            photos={preview.photos}
            name={preview.name}
            index={preview.index}
            onClose={closePreview}
            onNavigate={(index) => setPreview((p) => (p ? { ...p, index } : p))}
          />
        )}
      </Shell>
    </AuthGate>
  );
}
