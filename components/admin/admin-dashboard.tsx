"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Image as ImageIcon, Loader2, Mic, Pause, Play, Search, Users, X } from "lucide-react";
import { api, Button, Event, Shell, Status, Submission } from "./admin-ui";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { describeDownloadResponse, downloadErrorCodeFromResponse, downloadErrorMessage } from "@/lib/admin-download";

const PreviewDialog = dynamic(() => import("./admin-preview-dialog").then((m) => m.PreviewDialog));

const errorTextMap: Record<string, string> = {
  FORBIDDEN: "Kamu nggak bisa akses media ini.",
  NOT_FOUND: "Media ini udah nggak tersedia.",
  MEDIA_ACCESS_FAILED: "Media privatnya nggak bisa dibuka.",
};
export function errorText(code: string) {
  return code === "OFFLINE" ? "Media nggak tersedia offline. Coba lagi pas konek." : errorTextMap[code] ?? "Media nggak bisa diambil. Coba lagi item ini.";
}

const nameOf = (item: Submission) => item.guest_name?.trim() || "Tamu anonim";
const ID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtFull = (iso: string) => {
  const d = new Date(iso);
  return `${fmtDate(d)} · ${fmtTime(d)}`;
};
const fmtRange = (oldestIso: string, newestIso: string) => {
  const oldest = new Date(oldestIso);
  const newest = new Date(newestIso);
  return `${fmtDate(newest)} · ${fmtTime(oldest)}–${fmtTime(newest)}`;
};
const fmtDuration = (s?: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
export const typeLabel = (item: Submission) => (item.type === "PHOTO" ? "Foto" : "Pesan suara");

type Group = { ref: string; name: string; session: number | null; items: Submission[] };

// DESIGN.md §6: exactly 3 derived metrics, client-side from loaded items only.
export function deriveMetrics(items: Submission[]) {
  const guests = new Set<string>();
  let photos = 0;
  let voices = 0;
  for (const item of items) {
    guests.add(item.guest_session_ref);
    if (item.type === "PHOTO") photos += 1;
    else voices += 1;
  }
  return { guests: guests.size, photos, voices };
}

type MediaFilter = "ALL" | "PHOTO" | "VOICE_NOTE";
const MEDIA_SEGMENTS: { value: MediaFilter; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "PHOTO", label: "Foto" },
  { value: "VOICE_NOTE", label: "Suara" },
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

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const quietButton = "border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated";
// Decorative static waveform behind the voice progress bar (fixed heights, muted).
const WAVEFORM_BARS = [0.35, 0.6, 0.45, 0.8, 1, 0.7, 0.5, 0.9, 0.65, 0.4, 0.75, 0.55, 0.85, 0.5, 0.3, 0.62, 0.9, 0.7, 0.45, 0.66, 0.82, 0.52, 0.36, 0.58];

const downloadFileName = (item: Submission) => {
  const m = item.mime_type.toLowerCase();
  const ext = m.includes("png") ? "png" : m.includes("jpeg") ? "jpg" : m.includes("webm") ? "webm" : m.includes("mpeg") ? "m4a" : m.includes("quicktime") ? "mov" : "bin";
  const base = item.type === "PHOTO" ? "photo" : "voice-note";
  return `${base}-${item.created_at.slice(0, 10)}.${ext}`;
};

export function useDownload(item: Submission) {
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
        aria-label={`Unduh ${typeLabel(item).toLowerCase()} dari ${name}`}
        onClick={retry}
        disabled={busy}
        className={`flex h-12 items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-3 text-xs font-semibold text-text-secondary transition duration-fast ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Mengunduh…" : "Unduh"}
      </button>
      {error && (
        <span className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated/90 p-2">
          <span role="alert" className="text-xs text-error">
            <span className="font-semibold text-text-primary">
              {typeLabel(item)} dari {name}:{" "}
            </span>
            {error}
          </span>
          <button type="button" onClick={retry} className={`min-h-12 rounded-md px-3 text-xs font-semibold transition duration-fast ${quietButton} ${focusRing}`}>
            Coba lagi
          </button>
        </span>
      )}
    </>
  );
}

// Fires once when the element scrolls within rootMargin of the viewport, then disconnects.
function useInViewOnce<T extends Element>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        obs.disconnect();
      }
    }, { rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}

function PhotoTile({ item, name, onPreview }: { item: Submission; name: string; onPreview: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { ref, inView } = useInViewOnce<HTMLDivElement>("200px");
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
    if (inView && !url && !error) void load();
  }, [inView, url, error, load]);

  return (
    <div ref={ref} className="relative overflow-hidden rounded-lg border border-border bg-bg-surface">
      {error ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-bg-elevated p-3 text-center">
          <p role="alert" className="text-xs text-text-muted">
            {errorText(error)}
          </p>
          <button type="button" onClick={load} className={`min-h-12 rounded-md px-3 text-xs font-semibold transition duration-fast ${quietButton} ${focusRing}`}>
            Coba lagi
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          disabled={!url}
          aria-label={`Lihat foto dari ${name}, ${fmtFull(item.created_at)}`}
          className={`group block w-full text-left transition duration-fast ease-out disabled:cursor-wait ${focusRing}`}
        >
          <span className="block aspect-square w-full overflow-hidden bg-bg-elevated">
            {loading && (
              <span role="status" className="flex h-full w-full items-center justify-center text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only">Memuat foto…</span>
              </span>
            )}
            {url && (
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-base ease-out motion-reduce:transition-none motion-safe:group-hover:scale-[1.03]"
              />
            )}
          </span>
          <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary">
              <ImageIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              Foto
            </span>
            <time dateTime={item.created_at} className="font-mono tabular-nums text-text-muted">
              {fmtFull(item.created_at)}
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-bg-surface/90 p-3">
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
        aria-label={`${playing ? "Jeda" : "Putar"} pesan suara dari ${name}${duration ? `, ${item.duration_seconds} detik` : ""}`}
        className={`flex min-h-12 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition duration-fast ease-out disabled:opacity-60 ${quietButton} ${focusRing}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
        {loading ? "Memuat" : playing ? "Jeda" : "Putar"}
      </button>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary">
        <Mic className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        Pesan suara
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
        {fmtFull(item.created_at)}
      </time>
      <DownloadButton item={item} name={name} />
      {loading && (
        <p role="status" className="sr-only">
          Memuat pesan suara…
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
    photos.length ? `${photos.length} foto` : "",
    voices.length ? `${voices.length} pesan suara` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="py-5">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center gap-3 rounded-md py-1 text-left ${focusRing}`}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-semibold text-text-secondary">
            {initialsOf(group.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-text-primary">{group.name}</span>
              {group.session !== null && (
                <span className="text-xs font-medium text-text-muted">Sesi {group.session}</span>
              )}
              <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums text-text-secondary">
                {group.items.length} item
              </span>
            </span>
            <span className="mt-1 block text-xs text-text-muted">
              {breakdown} · {group.items.length > 1 ? fmtRange(oldest.created_at, newest.created_at) : fmtFull(newest.created_at)}
            </span>
          </span>
        </button>
      </h3>
      {open && (
        <div id={contentId} className="mt-3 grid gap-3">
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {photos.map((item) => (
                <PhotoTile key={item.id} item={item} name={group.name} onPreview={() => onPreview(item)} />
              ))}
            </div>
          )}
          {voices.length > 0 && (
            <div className={photos.length > 0 ? "border-t border-border pt-3" : ""}>
              <p className="mb-2 text-xs font-medium tracking-[0.04em] text-text-muted">
                Pesan suara
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
    </article>
  );
}

function TimelineSkeleton() {
  return (
    <div role="status" className="grid animate-pulse divide-y divide-border">
      {[0, 1].map((g) => (
        <div key={g} aria-hidden="true" className="py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-bg-elevated" />
            <div className="h-4 w-36 rounded bg-bg-elevated" />
            <div className="h-5 w-16 rounded-full bg-bg-elevated" />
            <div className="ml-auto h-4 w-28 rounded bg-bg-elevated" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {[0, 1, 2, 3].map((t) => (
              <div key={t} className="aspect-square rounded-lg bg-bg-elevated" />
            ))}
          </div>
        </div>
      ))}
                <span className="sr-only">Memuat kiriman…</span>
    </div>
  );
}

function AsideSkeleton() {
  return (
              <div role="status" className="animate-pulse">
      <div aria-hidden="true">
        <div className="h-3 w-20 rounded bg-bg-elevated" />
        <div className="mt-3 h-9 w-48 rounded bg-bg-elevated" />
        <div className="mt-3 h-6 w-16 rounded-full bg-bg-elevated" />
        <div className="mt-6 grid gap-2">
          <div className="min-h-12 rounded-lg bg-bg-elevated" />
          <div className="min-h-12 rounded-lg bg-bg-elevated" />
        </div>
      </div>
                  <span className="sr-only">Memuat acara</span>
    </div>
  );
}

export function AdminDashboard({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [items, setItems] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ photos: Submission[]; name: string; index: number } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Last search actually sent to the API — drives the polite result announcement.
  const [appliedQuery, setAppliedQuery] = useState("");
  const lastSearchRef = useRef("");

  async function load(search = query) {
    setBusy(true);
    setError("");
    try {
      const suffix = search ? `?guest_name=${encodeURIComponent(search)}` : "";
      const [eventRes, subsRes] = await Promise.all([
        api<{ event: Event }>(`/api/admin/events/${publicId}`),
        api<{ submissions: Submission[] }>(`/api/admin/events/${publicId}/submissions${suffix}`),
      ]);
      setEvent(eventRes.event);
      setItems(subsRes.submissions);
      setAppliedQuery(search);
      lastSearchRef.current = search;
    } catch (e) {
      const code = (e as Error).message;
      // UI_UX §5.5: unauthenticated access redirects to sign-in.
      if (code === "AUTHENTICATION_REQUIRED") {
        router.replace("/admin/sign-in");
        return;
      }
      setError(code);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load("");
  }, [publicId]);
  // DESIGN.md §6: inline debounced search — no submit button; Enter loads
  // immediately (pending timer no-ops on the same query), Escape clears.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (query !== lastSearchRef.current) void load(query);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query]);

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

  // DESIGN.md §6: destructive action — red, not gold. CLOSED events only.
  async function deleteEvent() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api<{ deleted: boolean }>(`/api/admin/events/${publicId}/delete`, { method: "DELETE" });
      router.replace("/admin");
    } catch (e) {
      const code = (e as Error).message;
      setDeleteError(
        code === "FORBIDDEN"
          ? "Acara masih aktif. Tutup dulu sebelum menghapus."
          : code === "NOT_FOUND"
            ? "Acara udah nggak ada."
            : code === "OFFLINE"
              ? "Kamu lagi offline. Coba lagi pas konek."
              : "Acaranya gagal dihapus. Aman buat coba lagi.",
      );
      setDeleting(false);
    }
  }

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("ALL");
  // Derived metrics from the loaded submissions only — no extra fetch (task spec).
  const metrics = useMemo(() => deriveMetrics(items), [items]);
  const metricCards = [
    { label: "Tamu", value: metrics.guests, icon: Users },
    { label: "Foto", value: metrics.photos, icon: ImageIcon },
    { label: "Pesan suara", value: metrics.voices, icon: Mic },
  ];
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
    <Shell eyebrow="Event desk" breadcrumb={{ href: "/admin", label: "Semua acara" }}>
        {/* Prototype layout skeleton: desktop sidebar (lg) + main column
            (event header → stats → media surface + utility aside). */}
        <div className="mx-auto w-full max-w-[74rem] lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <nav className="sticky top-8 grid gap-1">
              <Link
                href="/admin"
                className={`flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-text-muted transition duration-fast hover:bg-bg-surface hover:text-text-primary ${focusRing}`}
              >
                Semua acara
              </Link>
              <Link
                href={`/admin/events/${publicId}/access`}
                className={`flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-text-muted transition duration-fast hover:bg-bg-surface hover:text-text-primary ${focusRing}`}
              >
                Akses / QR
              </Link>
            </nav>
          </aside>
          <div>
            <header className="border-b border-border pb-6">
              {busy && !event ? (
                <AsideSkeleton />
              ) : error && !event ? (
                <Status error message={errorText(error)} action={<Button secondary onClick={() => load("")}>Coba lagi</Button>} />
              ) : (
                event && (
                  <div className="md:flex md:items-end md:justify-between md:gap-6">
                    <div>
                      <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary">{event.title}</h1>
                      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${event.status === "ACTIVE" ? "border-accent/40 bg-accent-soft text-accent" : "border-border text-text-muted"}`}>
                        {event.status === "ACTIVE" ? "Aktif" : "Selesai"}
                      </p>
                    </div>
                    <div className="mt-5 md:mt-0 md:flex md:justify-end">
                      {event.status === "ACTIVE" ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button disabled={closing} className="w-full md:w-auto">
                              {closing ? "Menutup…" : "Tutup acara"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent showCloseButton={false} className="border-border bg-bg-elevated text-text-primary">
                            <DialogHeader>
                              <DialogTitle className="font-display text-xl font-semibold tracking-tight text-text-primary">Tutup acara ini?</DialogTitle>
                              <DialogDescription className="text-text-secondary">
                                Setelah ditutup, tamu tidak bisa lagi mengirim foto atau pesan suara. Tindakan ini tidak bisa dibatalkan.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button secondary>Batal</Button>
                              </DialogClose>
                              <DialogClose asChild>
                                <button
                                  type="button"
                                  disabled={closing}
                                  onClick={() => void close()}
                                  className={`min-h-12 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition duration-fast hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
                                >
                                  Ya, tutup sekarang
                                </button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <Dialog onOpenChange={(open) => { if (!open) setDeleteError(""); }}>
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className={`min-h-11 w-full rounded-lg border border-red-500/20 bg-transparent px-4 text-xs font-medium text-red-400/70 transition duration-fast hover:border-red-500/40 hover:text-red-400 md:w-auto ${focusRing}`}
                            >
                              Hapus Event
                            </button>
                          </DialogTrigger>
                          <DialogContent showCloseButton={false} className="border-border bg-bg-elevated text-text-primary">
                            <DialogHeader>
                              <DialogTitle className="font-display text-xl font-semibold tracking-tight text-text-primary">Hapus event ini secara permanen?</DialogTitle>
                              <DialogDescription className="text-text-secondary">
                                Semua foto, pesan suara, dan data tamu akan dihapus selamanya. Tindakan ini tidak bisa dibatalkan.
                              </DialogDescription>
                            </DialogHeader>
                            {deleteError && (
                              <p role="alert" className="text-xs text-error">{deleteError}</p>
                            )}
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button secondary>Batal</Button>
                              </DialogClose>
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => void deleteEvent()}
                                className={`min-h-12 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition duration-fast hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
                              >
                                {deleting ? "Menghapus…" : "Ya, hapus selamanya"}
                              </button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                )
              )}
            </header>
            <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
              {metricCards.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-bg-surface p-4 last:col-span-2 md:last:col-span-1">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-elevated text-text-muted">
                      <stat.icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-xs text-text-muted">{stat.label}</p>
                  </div>
                  <p className="mt-3 font-mono text-2xl tabular-nums text-text-primary">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17.5rem] md:gap-5">
              <section className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-5">
                <div className="grid gap-4 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <p className="text-xs font-medium tracking-[0.04em] text-text-muted">Kiriman</p>
                    <h2 className="mt-1 text-xl font-semibold text-text-primary">Terbaru dulu</h2>
                  </div>
                  <div className="grid gap-2 md:w-60">
                    <label className="block" htmlFor="guest-search">
                      <span className="sr-only">Cari nama tamu</span>
                      <span className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                        <Input
                          id="guest-search"
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void load();
                            } else if (e.key === "Escape") {
                              setQuery("");
                            }
                          }}
                          placeholder="Cari nama tamu"
                          autoComplete="off"
                          className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {query && (
                          <button
                            type="button"
                            aria-label="Hapus pencarian"
                            onClick={() => setQuery("")}
                            className={`absolute right-1 top-1/2 inline-flex min-h-11 -translate-y-1/2 items-center px-2 text-text-muted transition duration-fast hover:text-text-primary ${focusRing}`}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </label>
                    <div role="group" aria-label="Saring jenis media" className="grid grid-cols-3 gap-[3px] rounded-[10px] border border-border bg-bg-base p-[3px]">
                      {MEDIA_SEGMENTS.map((segment) => {
                        const selected = mediaFilter === segment.value;
                        return (
                          <button
                            key={segment.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setMediaFilter(segment.value)}
                            className={`min-h-10 rounded-md text-xs font-bold transition duration-fast ${selected ? "bg-bg-elevated text-text-primary" : "text-text-muted hover:text-text-primary"} ${focusRing}`}
                          >
                            {segment.label}
                          </button>
                        );
                      })}
                    </div>
                    <p aria-live="polite" className="sr-only">
                      {!busy && appliedQuery
                        ? items.length
                          ? `${items.length} kiriman ditemukan`
                          : "Tidak ada kiriman ditemukan"
                        : ""}
                    </p>
                  </div>
                </div>
                {error && event && <Status error message={errorText(error)} action={<Button secondary onClick={() => load()}>Coba lagi</Button>} />}
                {busy ? (
                  <TimelineSkeleton />
                ) : groups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-text-muted">
                    {query
                      ? "Nggak ada kiriman yang cocok. Kosongkan atau ubah pencarian nama tamunya."
                      : mediaFilter !== "ALL"
                        ? `Nggak ada ${mediaFilter === "PHOTO" ? "foto" : "pesan suara"} yang cocok dengan saringan ini.`
                        : "Foto dan pesan suara baru bakal muncul di sini."}
                  </p>
                ) : (
                  <div className="divide-y divide-border">
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
              {event && (
                <aside className="grid gap-3">
                  <section className="rounded-xl border border-border bg-bg-surface p-3">
                    <Link
                      className={`flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold transition duration-fast ${quietButton} ${focusRing}`}
                      href={`/admin/events/${publicId}/access`}
                    >
                      Akses / QR
                    </Link>
                  </section>
                </aside>
              )}
            </div>
          </div>
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
  );
}
