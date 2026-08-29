import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
}

/** Decorative disposable-camera illustration — token-colored, aria-hidden. */
function DisposableCameraSVG() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 180 110"
      className="w-full h-auto"
      fill="none"
    >
      {/* Body */}
      <rect x="8" y="18" width="164" height="84" rx="10" fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1" />
      {/* Top strip */}
      <rect x="8" y="18" width="164" height="22" rx="10" fill="#252527" />
      <rect x="8" y="28" width="164" height="12" fill="#252527" />
      {/* Flash */}
      <rect x="16" y="24" width="28" height="10" rx="3" fill="var(--accent)" opacity="0.8" />
      {/* Shutter button */}
      <rect x="130" y="21" width="20" height="8" rx="4" fill="#3a3a3f" />
      {/* Viewfinder */}
      <rect x="110" y="24" width="14" height="10" rx="2" fill="var(--bg-base)" stroke="var(--border)" strokeWidth="0.5" />
      {/* Lens outer */}
      <circle cx="82" cy="60" r="28" fill="var(--bg-base)" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Lens inner rings (inherit cx=82 cy=60) */}
      <circle r="22" fill="#111113" stroke="var(--accent)" strokeOpacity="0.15" strokeWidth="1" />
      <circle r="15" fill="#0a0a0c" stroke="var(--accent)" strokeOpacity="0.2" strokeWidth="0.5" />
      <circle r="8" fill="var(--bg-surface)" />
      {/* Lens reflection */}
      <circle cx="75" cy="53" r="3" fill="var(--accent)" opacity="0.1" />
      {/* Film knob left */}
      <circle cx="28" cy="62" r="10" fill="#252527" stroke="var(--border)" strokeWidth="1" />
      <circle cx="28" cy="62" r="5" fill="#1a1a1d" />
      {/* Film knob right */}
      <circle cx="145" cy="62" r="10" fill="#252527" stroke="var(--border)" strokeWidth="1" />
      <circle cx="145" cy="62" r="5" fill="#1a1a1d" />
      {/* Film slot at bottom — photo prints out of here (full inner width) */}
      <rect x="10" y="98" width="160" height="4" fill="var(--bg-base)" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span aria-hidden="true" className="ml-2 inline-flex gap-1 align-middle">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="inline-block h-1 w-1 rounded-full bg-current"
          style={{ animation: `loading-dots 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  );
}

/**
 * DONE — terminal screen of the guest flow (DESIGN.md §5.6). Disposable-camera
 * thermal-print sequence (T034): loading text (1.0s) → camera drops in (2.5s)
 * → keepsake photo prints downward from the film slot via a 5s clip-path
 * reveal (3.2s; voice chip uses a 2s reveal) → thank-you + photo settles
 * rotate(-1.5deg) (8.5s) → keepsake card (9.0s). Condition C (nothing
 * submitted) skips the camera and shows the thank-you directly (0.5s/1.0s).
 * Reduced motion jumps straight to the final phase. Ambient ornaments
 * (owner-ratified): 3 bokeh orbs + film grain at all phases, warm film
 * light leaks fade in at phase 4.
 */
export function Done({
  eventTitle,
  keepsakeUrl,
  photoUrl = null,
  hasVoice = false,
}: {
  eventTitle: string;
  keepsakeUrl?: string | null;
  photoUrl?: string | null;
  hasVoice?: boolean;
}) {
  const hasKeepsakeEject = photoUrl != null || hasVoice;
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPhase(5);
      return;
    }
    if (!hasKeepsakeEject) {
      // Condition C: no camera, straight to thank-you.
      const timers = [setTimeout(() => setPhase(4), 500), setTimeout(() => setPhase(5), 1000)];
      return () => timers.forEach(clearTimeout);
    }
    const timers = [
      setTimeout(() => setPhase(1), 1000), // loading text
      setTimeout(() => setPhase(2), 2500), // camera appears
      setTimeout(() => setPhase(3), 3200), // thermal-print reveal starts
      setTimeout(() => setPhase(4), 8500), // thank you + photo settle
      setTimeout(() => setPhase(5), 9000), // keepsake card
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the thank-you heading when it lands (phase 4).
  useEffect(() => {
    if (phase >= 4) headingRef.current?.focus();
  }, [phase]);

  function downloadKeepsake() {
    if (!keepsakeUrl) return;
    const anchor = document.createElement("a");
    anchor.href = keepsakeUrl;
    anchor.download = `keepsake-${slugify(eventTitle)}-${Date.now()}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg-base px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-text-primary sm:px-8">
      {/* Celebration ornaments (owner-ratified) — implicit z-0 behind content */}
      <div aria-hidden="true" className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-accent/15 blur-[90px] animate-ambient-1 pointer-events-none" />
      <div aria-hidden="true" className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-accent/10 blur-[100px] animate-ambient-2 pointer-events-none" />
      <div aria-hidden="true" className="absolute top-1/2 -right-32 h-48 w-48 rounded-full bg-accent/8 blur-[80px] pointer-events-none" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 film-grain" />
      {phase >= 4 && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute left-0 top-[15%] h-[40%] w-[30%] rounded-r-full bg-gradient-to-r from-[#8B1A1A]/20 via-[#C85A00]/10 to-transparent blur-[40px] animate-leak-left" />
          <div aria-hidden="true" className="pointer-events-none absolute right-0 top-[30%] h-[30%] w-[25%] rounded-l-full bg-gradient-to-l from-[#6B0F0F]/15 via-[#A04000]/8 to-transparent blur-[35px] animate-leak-right" />
        </>
      )}

      <div className="relative z-10 flex w-full flex-col items-center">
      {hasKeepsakeEject && phase >= 1 && phase < 4 && (
        <p className="animate-fade-up font-mono text-sm text-text-muted">
          Sebentar ya, foto kamu lagi diproses
          <LoadingDots />
        </p>
      )}

      {hasKeepsakeEject && phase >= 2 && (
        <div className={`flex w-[200px] flex-col items-center ${phase === 2 ? "animate-camera-drop" : ""}${phase >= 4 ? " animate-slide-up-settle" : ""}`}>
          <DisposableCameraSVG />
          {/* Print slot — photo overlaps the slot's bottom edge by 2px, flush.
              Reveal is clip-path (unaffected by parent overflow-hidden, which
              only rounds the photo's bottom corners). Box reserves full height
              from phase 3 so layout never jumps. */}
          <div className="relative mt-[-2px] flex w-[200px] justify-center overflow-hidden rounded-b-xl">
            {phase >= 3 && photoUrl != null && (
              <div className={`animate-thermal-print${phase >= 4 ? " animate-thermal-settle" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- client-side object URL preview */}
                <img
                  src={photoUrl}
                  alt="Foto kenangan"
                  className="w-full aspect-[9/16] object-cover"
                />
              </div>
            )}
            {phase >= 3 && photoUrl == null && hasVoice && (
              <div className={`animate-thermal-print-fast flex h-[60px] w-[140px] flex-col items-center justify-center gap-1 rounded-b-lg border border-border/40 bg-bg-surface${phase >= 4 ? " animate-thermal-settle" : ""}`}>
                <Mic className="h-8 w-8 text-accent" aria-hidden="true" />
                <span className="font-mono text-xs text-text-muted">Pesan suara tersimpan</span>
              </div>
            )}
          </div>
        </div>
      )}

      {phase >= 4 && (
        <div className="animate-fade-up mt-8 flex flex-col items-center">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="sr-only font-display text-4xl font-semibold leading-tight tracking-tight outline-none"
          >
            {eventTitle}
          </h1>
          <p className="mt-4 max-w-sm text-sm text-text-secondary">
            Terima kasih — foto dan pesan suara kamu sudah kami terima.
          </p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Host akan melihatnya setelah acara.
          </p>
        </div>
      )}

      {/* Digital Keepsake — client-side download of the composited capture */}
      {phase >= 5 && photoUrl && keepsakeUrl && (
        <section className="animate-fade-up mt-8 w-full max-w-sm rounded-2xl border border-border bg-bg-surface/70 p-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={downloadKeepsake}
            className="mt-3 min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Simpan ke Galeri Saya
          </button>
          <p className="mt-2 text-xs text-text-muted">
            Unduh foto kenangan berbingkai dari acara ini.
          </p>
        </section>
      )}
      </div>
    </main>
  );
}
