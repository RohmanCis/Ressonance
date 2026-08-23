"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Check } from "lucide-react";
import { DEFAULT_FRAME_ID, FRAMES, type Frame } from "@/lib/frames";

const OPTIONS: Frame[] = FRAMES.filter((frame) => frame.id !== DEFAULT_FRAME_ID);

export function FrameSelection({
  eventTitle,
  onFrameConfirm,
}: {
  eventTitle: string;
  onFrameConfirm: (frame: Frame) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(OPTIONS[0]?.id ?? null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const selected = OPTIONS.find((frame) => frame.id === selectedId) ?? null;
  const noneFrame = FRAMES.find((frame) => frame.id === DEFAULT_FRAME_ID);

  function moveSelection(from: number, delta: number) {
    if (OPTIONS.length === 0) return;
    const next = (from + delta + OPTIONS.length) % OPTIONS.length;
    setSelectedId(OPTIONS[next].id);
    optionRefs.current[next]?.focus();
    optionRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(index, -1);
    }
  }

  function confirm() {
    if (selected) onFrameConfirm(selected);
    else if (noneFrame) onFrameConfirm(noneFrame);
  }

  return (
    <main className="relative flex h-dvh max-h-dvh w-full max-w-full flex-col justify-between overflow-hidden bg-bg-base text-text-primary select-none">
      
      {/* 1. AMBIENT GLOW & FILM GRAIN (ISOLATED INSIDE VIEWPORT) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-accent/15 blur-[90px]" />
        <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-accent/10 blur-[100px]" />
        <div className="absolute inset-0 film-grain" />
      </div>

      {/* 2. HEADER SECTION (COMPACT & CENTERED) */}
      <header className="relative z-10 shrink-0 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] text-center w-full max-w-full">
        <p className="font-script text-2xl text-accent drop-shadow-sm truncate">
          {eventTitle || "Wedding Keepsake"}
        </p>
        <h1
          id="frame-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-0.5 font-display text-3xl font-normal leading-tight tracking-tight text-text-primary outline-none sm:text-4xl"
        >
          Pilih Bingkai Foto
        </h1>
        <p className="mt-1 text-xs text-text-secondary">
          Bingkai akan terpatri otomatis di setiap jepretan foto Anda.
        </p>
      </header>

      {/* 3. HERO HORIZONTAL CAROUSEL (DETERMINISTIC 9:16 SIZING) */}
      <div className="relative z-10 flex flex-1 min-h-0 min-w-0 w-full max-w-full items-center justify-center py-2 overflow-hidden">
        <div
          role="radiogroup"
          aria-labelledby="frame-heading"
          className="scrollbar-hide flex h-full max-h-[50dvh] w-full max-w-full snap-x snap-mandatory items-center justify-start gap-4 overflow-x-auto overscroll-x-contain px-8 py-3 touch-pan-x sm:justify-center"
        >
          {OPTIONS.map((frame, index) => {
            const isSelected = frame.id === selectedId;
            return (
              <button
                key={frame.id}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={frame.label}
                tabIndex={selectedId === null ? (index === 0 ? 0 : -1) : isSelected ? 0 : -1}
                onClick={() => {
                  setSelectedId(frame.id);
                  optionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="group relative flex h-full shrink-0 snap-center flex-col items-center justify-between outline-none"
              >
                {/* 9:16 Card Container */}
                <div
                  className={`relative h-[calc(100%-1.75rem)] aspect-[9/16] overflow-hidden rounded-2xl border-2 bg-bg-surface/90 p-1.5 transition-[transform,opacity,border-color,box-shadow] duration-fast group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg-base ${
                    isSelected
                      ? "border-accent bg-accent-soft shadow-[0_0_25px_color-mix(in_srgb,var(--accent)_35%,transparent)] ring-1 ring-accent"
                      : "border-border/60 opacity-60 hover:opacity-100 hover:border-text-secondary"
                  }`}
                >
                  <img
                    src={frame.src}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none h-full w-full rounded-xl object-contain"
                  />

                  {/* Active Gold Check Badge */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent shadow-md"
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                </div>

                {/* Frame Title Label */}
                <span
                  className={`h-5 flex items-center justify-center text-xs font-medium transition-colors ${
                    isSelected ? "text-accent font-semibold" : "text-text-secondary"
                  }`}
                >
                  {frame.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. PINNED BOTTOM ACTION BAND */}
      <div className="relative z-10 shrink-0 space-y-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 max-w-md mx-auto w-full">
        <button
          type="button"
          onClick={confirm}
          className="gold-foil-btn h-12 w-full rounded-xl text-sm font-semibold transition duration-fast hover:brightness-105 active:scale-[0.98] shadow-lg"
        >
          {selected ? `Gunakan Bingkai ${selected.label}` : "Lanjut Tanpa Bingkai"}
        </button>

        <button
          type="button"
          onClick={() => { if (noneFrame) onFrameConfirm(noneFrame); }}
          className="block min-h-12 w-full text-center text-xs font-medium text-text-muted underline underline-offset-4 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Lewati — Tanpa Bingkai
        </button>
      </div>
    </main>
  );
}