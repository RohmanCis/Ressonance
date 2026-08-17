"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { DEFAULT_FRAME_ID, FRAMES, type Frame } from "@/lib/frames";

/**
 * FrameSelector — pre-camera step: guest picks a photo frame.
 *
 * UI_UX §4.2 (guest flow) + UI_DESIGN tokens: bg-primary CTA, border-primary
 * selection, font-display heading, 48px guest primary, 4px grid unit.
 * "No Frame" is never a grid option; it is reachable only via the skip link.
 * Preview cards use the enforced 9:16 frame ratio; the preview image uses
 * object-contain so placeholder/final art is never distorted (UI_DESIGN §11).
 */

const OPTIONS: Frame[] = FRAMES.filter((frame) => frame.id !== DEFAULT_FRAME_ID);

export function FrameSelector({ onSelect }: { onSelect: (frame: Frame) => void }) {
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
    if (selected) onSelect(selected);
    else if (noneFrame) onSelect(noneFrame);
  }

  return (
    <section aria-labelledby="frame-heading" className="space-y-4">
      <h2 id="frame-heading" className="font-display text-xl font-semibold">Choose a frame</h2>
      <p className="text-sm text-muted-foreground">
        The frame is added to your photos when you take them. You can also continue without one.
      </p>

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
              className="text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className={`relative block aspect-[9/16] overflow-hidden rounded-md border-2 bg-muted ${
                  isSelected ? "border-primary ring-2 ring-primary ring-offset-2" : "border-border"
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
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    ✓
                  </span>
                )}
              </span>
              <span className="mt-2 block text-sm font-medium">{frame.label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 pt-2">
        <button
          type="button"
          onClick={confirm}
          className="min-h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] transition duration-200 ease-out hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {selected ? `Use ${selected.label}` : "Continue without frame"}
        </button>

        {selected && (
          <button
            type="button"
            onClick={() => { if (noneFrame) onSelect(noneFrame); }}
            className="block min-h-11 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Skip — no frame
          </button>
        )}
      </div>
    </section>
  );
}
