import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
}

/**
 * DONE — terminal screen of the guest flow (DESIGN.md §5.6). Quiet, centered,
 * full-screen --bg-base: one gold check glyph (not animated), the event
 * title in Cormorant 4xl, two short receipt lines, the animated wax-seal
 * stamp (Luxury Analog), and an optional Digital Keepsake card offering a
 * client-side download of the last composited capture. No navigation — the
 * session is closed from the guest perspective.
 */
export function Done({
  eventTitle,
  keepsakeUrl,
}: {
  eventTitle: string;
  keepsakeUrl?: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-text-primary sm:px-8">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-on-accent"
      >
        <Check className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight outline-none"
      >
        {eventTitle}
      </h1>
      <p className="mt-4 max-w-sm text-sm text-text-secondary">
        Terima kasih — foto dan pesan suara Anda sudah kami terima.
      </p>
      <p className="mt-1 max-w-sm text-sm text-text-muted">
        Host akan melihatnya setelah acara.
      </p>

      {/* Wax seal — stamp-drop entrance */}
      <div
        aria-hidden="true"
        className="animate-stamp mt-8 flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-accent/60 bg-[radial-gradient(circle_at_35%_30%,#f0d97a,#d4af37_45%,#8a6d1f)] text-on-accent shadow-[0_6px_20px_rgba(212,175,55,0.35)]"
      >
        <span className="font-script text-3xl leading-none">A &amp; J</span>
        <span className="mt-1 text-[0.55rem] font-semibold tracking-[0.3em]">SEALED</span>
      </div>

      {/* Digital Keepsake — client-side download of the composited capture */}
      {keepsakeUrl && (
        <section className="mt-8 w-full max-w-sm rounded-xl border border-border bg-bg-surface p-6">
          <h2 className="font-display text-xl font-semibold text-text-primary">
            Simpan Kenangan Digital
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Unduh foto kenangan berbingkai dari acara ini ke galeri Anda.
          </p>
          <button
            type="button"
            onClick={downloadKeepsake}
            className="mt-4 min-h-12 w-full rounded-lg border border-border px-4 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Simpan ke Galeri Saya
          </button>
        </section>
      )}
    </main>
  );
}
