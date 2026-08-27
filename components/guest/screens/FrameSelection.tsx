"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Camera, Check, CircleOff } from "lucide-react";
import { DEFAULT_FRAME_ID, FRAMES, type Frame } from "@/lib/frames";

const OPTIONS: Frame[] = FRAMES.filter(
  (frame) => frame.id !== DEFAULT_FRAME_ID,
);

export function FrameSelection({
  eventTitle,
  onFrameConfirm,
}: {
  eventTitle: string;
  onFrameConfirm: (frame: Frame) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    OPTIONS[0]?.id ?? null,
  );

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const selected =
    OPTIONS.find((frame) => frame.id === selectedId) ?? null;

  const selectedIndex = OPTIONS.findIndex(
    (frame) => frame.id === selectedId,
  );

  const noneFrame = FRAMES.find(
    (frame) => frame.id === DEFAULT_FRAME_ID,
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function moveSelection(from: number, delta: number) {
    if (OPTIONS.length === 0) return;

    const next =
      (from + delta + OPTIONS.length) % OPTIONS.length;

    setSelectedId(OPTIONS[next].id);

    optionRefs.current[next]?.focus();

    optionRefs.current[next]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      moveSelection(index, 1);
    } else if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      moveSelection(index, -1);
    }
  }

  function confirm() {
    if (selected) {
      onFrameConfirm(selected);
    }
  }

  return (
    <main className="relative flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden bg-bg-base text-text-primary select-none">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-accent/15 blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-[110px]" />
        <div className="film-grain absolute inset-0" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full shrink-0 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] text-center">
        <p className="truncate font-script text-2xl text-accent drop-shadow-sm">
          {eventTitle || "Wedding Keepsake"}
        </p>

        <div
          aria-hidden="true"
          className="mx-auto mt-2 flex items-center justify-center gap-3"
        >
          <span className="h-px w-10 bg-accent/50" />
          <span className="text-accent text-xs">◆</span>
          <span className="h-px w-10 bg-accent/50" />
        </div>

        <h1
          id="frame-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-3xl font-normal leading-tight tracking-tight text-text-primary outline-none sm:text-4xl"
        >
          Pilih Frame fotomu
        </h1>

        <p className="mt-2 text-sm text-text-secondary">
          Pilih Frame yang paling kamu suka.
        </p>
      </header>

      {/* Frame carousel */}
      <section className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden py-3">
        <div
          role="radiogroup"
          aria-labelledby="frame-heading"
          className="scrollbar-hide flex h-full max-h-[58dvh] w-full max-w-full snap-x snap-mandatory items-center justify-start gap-4 overflow-x-auto overscroll-x-contain px-8 py-4 touch-pan-x sm:justify-center"
        >
          {OPTIONS.map((frame, index) => {
            const isSelected = frame.id === selectedId;

            return (
              <button
                key={frame.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={frame.label}
                tabIndex={
                  selectedId === null
                    ? index === 0
                      ? 0
                      : -1
                    : isSelected
                      ? 0
                      : -1
                }
                onClick={() => {
                  setSelectedId(frame.id);

                  optionRefs.current[index]?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center",
                  });
                }}
                onKeyDown={(event) =>
                  handleKeyDown(event, index)
                }
                className="group relative flex h-full shrink-0 snap-center flex-col items-center justify-center outline-none"
              >
                {/* Frame */}
                <div
                  className={`relative aspect-[9/16] h-[calc(100%-2rem)] max-h-[52dvh] overflow-hidden rounded-2xl border-2 bg-bg-surface/90 p-1.5 transition-[transform,opacity,border-color,box-shadow] duration-fast group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg-base ${
                    isSelected
                      ? "scale-[1.02] border-accent bg-accent-soft shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_35%,transparent)] ring-1 ring-accent"
                      : "border-border/60 opacity-55 hover:border-text-secondary hover:opacity-90"
                  }`}
                >
                  <img
                    src={frame.src}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none h-full w-full rounded-xl object-contain"
                  />

                  {/* Selection badge */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg"
                    >
                      <Check
                        className="h-4 w-4"
                        strokeWidth={3}
                      />
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={`mt-3 flex min-h-5 items-center justify-center text-sm font-medium transition-colors ${
                    isSelected
                      ? "font-semibold text-accent"
                      : "text-text-secondary"
                  }`}
                >
                  {frame.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selection indicators */}
      {OPTIONS.length > 1 && (
        <div
          aria-hidden="true"
          className="relative z-10 flex shrink-0 items-center justify-center gap-2 pb-3"
        >
          {OPTIONS.map((frame, index) => {
            const isSelected = index === selectedIndex;

            return (
              // Fixed-width track; the active bar elongates via scaleX only
              // (DESIGN.md §4: transform/opacity, never layout properties).
              // Reduced-motion zeroes the transition — static end states stay
              // correct: active = full accent bar, inactive = muted dot.
              <span
                key={frame.id}
                className="relative block h-2 w-5 overflow-hidden rounded-full"
              >
                <span className="absolute left-0 top-0 h-2 w-2 rounded-full bg-text-muted/40" />
                <span
                  className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-[var(--motion-base)]"
                  style={{ transform: `scaleX(${isSelected ? 1 : 0})` }}
                />
              </span>
            );
          })}
        </div>
      )}

      {/* Bottom action band */}
      <div className="relative z-10 mx-auto w-full max-w-md shrink-0 space-y-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8">
        <button
          type="button"
          onClick={confirm}
          disabled={!selected}
          className="gold-foil-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-lg transition duration-fast hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera
            className="h-4 w-4"
            aria-hidden="true"
          />

          <span>
            {selected
              ? `Pakai ${selected.label}`
              : "Pilih Frame"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (noneFrame) {
              onFrameConfirm(noneFrame);
            }
          }}
          className="flex min-h-12 w-full items-center justify-center gap-2 text-center text-xs font-medium text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <CircleOff
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />

          <span>Tanpa Frame, lanjut</span>
        </button>

        <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-text-muted">
          <span
            aria-hidden="true"
            className="h-px w-6 bg-border"
          />

          <span>30 menit untuk abadikan momenmu.</span>

          <span
            aria-hidden="true"
            className="h-px w-6 bg-border"
          />
        </div>
      </div>
    </main>
  );
}