"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { Button, Status, Submission, api } from "./admin-ui";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { errorText, fmtFull, focusRing, typeLabel, useDownload } from "./admin-dashboard";

export function PreviewDialog({
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
            <img src={url} alt={`Photo from ${name}`} decoding="async" className="max-h-[70vh] w-full rounded-md bg-bg-surface object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
