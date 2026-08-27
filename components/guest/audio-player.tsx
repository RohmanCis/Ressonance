"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Guest voice-note playback (DESIGN.md §2/§5.5). Custom dark player replacing
 * the native <audio controls> chrome: gold play/pause, accent-fill seek over a
 * --border hairline track, DM Mono elapsed/total. No volume/download controls.
 * Seek is a real input[type=range] stretched to a 44px touch target over the
 * visual hairline track; the fill is a scaleX transform (motion-safe only).
 */
export function AudioPlayer({ src, duration }: { src: string; duration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const total = Math.max(1, duration);
  const progress = Math.min(1, elapsed / total);

  useEffect(() => {
    setElapsed(0);
    setPlaying(false);
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-bg-surface px-4 py-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        aria-label="Voice note playback"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setElapsed(0)}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent transition-transform duration-fast active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {playing ? (
          <Pause className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Play className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <div className="relative flex h-11 flex-1 items-center">
        <span className="block h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            className="block h-full w-full origin-left rounded-full bg-accent transition-transform duration-fast motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress})` }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={Math.min(elapsed, total)}
          onChange={(e) => {
            const next = Number(e.target.value);
            const audio = audioRef.current;
            if (audio) audio.currentTime = next;
            setElapsed(next);
          }}
          aria-label="Seek voice note"
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
        />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
        {formatTime(elapsed)} / {formatTime(total)}
      </span>
    </div>
  );
}
