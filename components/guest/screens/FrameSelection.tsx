"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Check } from "lucide-react";
import { DEFAULT_FRAME_ID, FRAMES, type Frame } from "@/lib/frames";

/**
 * FRAME_SELECTION — pre-camera frame picker (DESIGN.md §5.2). Full-screen
 * --bg-base, Cormorant heading, 2-column grid of 9:16 preview cards on
 * --bg-surface with --border hairlines; the selected card settles with a
 * gold 2px border + --accent-soft fill + gold check badge. "No Frame" is
 * never a grid card — reachable only via the skip link. Radio-group keyboard
 * behavior (arrow keys, roving tabindex, aria-checked) is preserved.
 */

const OPTIONS: Frame[] = FRAMES.filter((frame) => frame.id !== DEFAULT_FRAME_ID);

export function FrameSelection({
  eventTitle,
  onFrameConfirm,
}: {
  eventTitle: string;
  onFrameConfirm: (frame: Frame) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = OPTIONS.find((frame) => frame.id === selectedId) ?? null;
  const noneFrame = FRAMES.find((frame) => frame.id === DEFAULT_FRAME_ID);

  function moveSelection(from: number, delta: number) {
    if (OPTIONS.length === 0) return;
    const next = (from + delta + OPTIONS.length) % OPTIONS.length;
    setSelectedId(OPTIONS[next].id);
    optionRefs.current[next]?.focus();
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
    <main className="flex min-h-dvh flex-col bg-bg-base text-text-primary">
      <header className="px-5 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-8">
        <p className="truncate text-xs font-medium tracking-[0.04em] text-text-muted">{eventTitle}</p>
        <h1
          id="frame-heading"
          className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight"
        >
          Choose a frame
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          The frame is added to your photos when you take them. You can also continue without one.
        </p>
      </header>

      <div className="flex-1 px-5 py-6 sm:px-8">
        <div
          role="radiogroup"
          aria-labelledby="frame-heading"
          className="grid grid-cols-2 gap-3"
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
                onClick={() => setSelectedId(frame.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  className={`relative block aspect-[9/16] overflow-hidden rounded-lg border-2 bg-bg-surface transition-transform duration-fast hover:scale-[1.02] ${
                    isSelected ? "scale-[1.02] border-accent bg-accent-soft" : "border-border"
                  }`}
                >
                  <img
                    src={frame.src}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  />
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-sm font-medium">{frame.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom action band, safe-area pinned */}
      <div className="space-y-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
        <button
          type="button"
          onClick={confirm}
          className="gold-foil-btn min-h-12 w-full rounded-lg px-4 font-semibold transition duration-fast ease-out"
        >
          {selected ? `Use ${selected.label}` : "Continue without frame"}
        </button>

        {selected && (
          <button
            type="button"
            onClick={() => { if (noneFrame) onFrameConfirm(noneFrame); }}
            className="block min-h-11 w-full text-center text-sm font-medium text-text-muted underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Skip — no frame
          </button>
        )}
      </div>
    </main>
  );
}
