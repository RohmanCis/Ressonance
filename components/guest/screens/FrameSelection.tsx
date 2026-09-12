"use client";

import { KeyboardEvent, useEffect, useRef, useState, useCallback } from "react";
import { Camera, Check, CircleOff } from "lucide-react";
import { DEFAULT_FRAME_ID, FRAMES, type Frame } from "@/lib/frames";
import { AmbientBackdrop } from "@/components/guest/ambient-backdrop";

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isProgrammaticScroll = useRef(false);
  const scrollResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const selected = OPTIONS.find((frame) => frame.id === selectedId) ?? null;
  const selectedIndex = OPTIONS.findIndex((frame) => frame.id === selectedId);
  const noneFrame = FRAMES.find((frame) => frame.id === DEFAULT_FRAME_ID);

  // Fokus + scroll kembali ke kartu tengah kontainer lokal tanpa menyentuh viewport utama
  const endProgrammaticScroll = useCallback(() => {
    isProgrammaticScroll.current = false;
  }, []);

  const scrollToItem = useCallback((index: number) => {
    const container = containerRef.current;
    const target = optionRefs.current[index];
    if (!container || !target) return;

    isProgrammaticScroll.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const containerWidth = container.clientWidth;
    const targetLeft = target.offsetLeft;
    const targetWidth = target.clientWidth;

    // Hitung posisi tengah kartu relatif terhadap container
    const scrollTarget = targetLeft - containerWidth / 2 + targetWidth / 2;

    container.scrollTo({
      left: Math.max(0, scrollTarget),
      behavior: reduced ? "auto" : "smooth",
    });

    // Bersihkan reset timeout yang belum selesai sebelum memasang yang baru
    if (scrollResetTimer.current) {
      clearTimeout(scrollResetTimer.current);
      scrollResetTimer.current = null;
    }

    // Reset flag scrolling saat animasi selesai; pakai scrollend bila didukung
    if ("onscrollend" in container) {
      container.removeEventListener("scrollend", endProgrammaticScroll);
      container.addEventListener("scrollend", endProgrammaticScroll, { once: true });
    } else {
      scrollResetTimer.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
        scrollResetTimer.current = null;
      }, 350);
    }
  }, [endProgrammaticScroll]);

  // Bersihkan scrollend listener + timeout pending pada unmount
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      if (scrollResetTimer.current) {
        clearTimeout(scrollResetTimer.current);
        scrollResetTimer.current = null;
      }
      container?.removeEventListener("scrollend", endProgrammaticScroll);
    };
  }, [endProgrammaticScroll]);

  // paddingInline diukur dari lebar kartu nyata (height-driven) agar frame
  // pertama & terakhir bisa center sempurna di semua viewport/orientasi
  const [carouselPad, setCarouselPad] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    const card = optionRefs.current[0];
    if (!container || !card) return;

    const update = () =>
      setCarouselPad(Math.max(0, (container.clientWidth - card.clientWidth) / 2));
    update();

    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  // Sinkronisasi swipe sentuh via Intersection Observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || OPTIONS.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;

        // Dua kartu bisa sama-sama >= 0.6 saat swipe; pilih rasio terbesar
        const best = entries
          .filter((entry) => entry.intersectionRatio >= 0.6)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = best?.target.getAttribute("data-frame-id");
        if (id) setSelectedId(id);
      },
      {
        root: container,
        threshold: 0.6,
      }
    );

    optionRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  function moveSelection(from: number, delta: number) {
    if (OPTIONS.length === 0) return;
    const next = (from + delta + OPTIONS.length) % OPTIONS.length;
    setSelectedId(OPTIONS[next].id);

    // Cegah browser menggeser viewport saat memindahkan fokus tombol
    optionRefs.current[next]?.focus({ preventScroll: true });
    scrollToItem(next);
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

  return (
    <main className="relative flex h-dvh max-h-dvh w-full max-w-full flex-col justify-between overflow-hidden bg-bg-base text-text-primary select-none">
      {/* Background Ambience */}
      <AmbientBackdrop />

      {/* Header Terkunci */}
      <header className="relative z-10 w-full shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top))] text-center">
        <p className="truncate font-script text-xl sm:text-2xl text-accent drop-shadow-sm">
          {eventTitle}
        </p>

        <div aria-hidden="true" className="flex items-center justify-center gap-3 my-2">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-accent/60" />
          <span className="h-1 w-1 rotate-45 bg-accent/80" />
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-accent/60" />
        </div>

        <h1
          id="frame-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-text-primary outline-none"
        >
          Pilih Frame fotomu
        </h1>
      </header>

      {/* Frame Carousel Area */}
      <section className="relative z-10 flex min-h-0 flex-1 items-center justify-center w-full overflow-hidden">
        <div
          ref={containerRef}
          role="radiogroup"
          aria-labelledby="frame-heading"
          className="scrollbar-hide flex h-full max-h-[50dvh] w-full snap-x snap-mandatory items-center justify-start gap-4 overflow-x-auto overscroll-x-contain py-2 touch-pan-x"
          style={{ paddingInline: carouselPad }}
        >
          {OPTIONS.map((frame, index) => {
            const isSelected = frame.id === selectedId;

            return (
              <button
                key={frame.id}
                data-frame-id={frame.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={frame.label}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => {
                  setSelectedId(frame.id);
                  scrollToItem(index);
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="group relative flex h-full shrink-0 snap-center flex-col items-center justify-center outline-none"
              >
                <div
                  className={`relative aspect-[9/16] h-[calc(100%-1.75rem)] max-h-[46dvh] overflow-hidden rounded-2xl border-2 bg-bg-surface/90 p-1.5 transition-[transform,opacity] duration-fast group-focus-visible:ring-2 group-focus-visible:ring-accent ${
                    isSelected
                      ? "z-10 scale-105 border-accent bg-accent/10 shadow-[0_0_30px_color-mix(in_srgb,var(--accent)_30%,transparent)] ring-1 ring-accent"
                      : "border-border/70 opacity-80 scale-90 hover:opacity-100"
                  }`}
                >
                  <img
                    src={frame.src}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none relative z-10 h-full w-full rounded-xl object-contain"
                  />

                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent shadow-md"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                </div>

                <span
                  className={`mt-2 w-full truncate text-center text-xs sm:text-sm transition-colors ${
                    isSelected ? "font-semibold text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {frame.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Indikator Titik */}
      {OPTIONS.length > 1 && (
        <div aria-hidden="true" className="relative z-10 flex shrink-0 items-center justify-center gap-1.5 pb-2">
          {OPTIONS.map((frame, index) => {
            const isSelected = index === selectedIndex;
            return (
              <span key={frame.id} className="relative block h-1.5 w-4 overflow-hidden rounded-full">
                <span className="absolute inset-0 rounded-full bg-text-muted/30" />
                <span
                  className="absolute inset-0 rounded-full bg-accent transition-transform duration-fast"
                  style={{ transform: `scaleX(${isSelected ? 1 : 0})` }}
                />
              </span>
            );
          })}
        </div>
      )}

      {/* Tombol Aksi Bawah */}
      <div className="relative z-10 mx-auto w-full max-w-md shrink-0 space-y-2 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8">
        <button
          type="button"
          onClick={() => selected && onFrameConfirm(selected)}
          disabled={!selected}
          className="gold-foil-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-lg transition duration-fast hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span>{selected ? `Pilih ${selected.label}` : "Pilih Frame"}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!noneFrame) return;
            onFrameConfirm(noneFrame);
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 text-xs font-medium text-text-muted underline underline-offset-4 hover:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-accent"
        >
          <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tanpa Frame</span>
        </button>
      </div>
    </main>
  );
}