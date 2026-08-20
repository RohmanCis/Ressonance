import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

/**
 * DONE — terminal screen of the guest flow (DESIGN.md §5.4). Quiet, centered,
 * full-screen --bg-base: one gold check glyph (not animated), the event
 * title in Cormorant 4xl, two short receipt lines. No actions, no
 * navigation — the session is closed from the guest perspective.
 */
export function Done({ eventTitle }: { eventTitle: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
    </main>
  );
}
