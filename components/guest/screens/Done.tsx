import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

/**
 * DONE — terminal screen of the sequential guest flow. The session is
 * closed from the guest perspective; no further actions are offered.
 */
export function Done({ eventTitle }: { eventTitle: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-foreground sm:px-8">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground shadow-[var(--shadow-1)]"
      >
        <Check className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight outline-none"
      >
        Terima kasih!
      </h1>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{eventTitle}</p>
      <p className="mt-4 max-w-sm text-sm text-muted-foreground">
        Foto dan pesan suara Anda sudah kami terima. Host akan melihatnya setelah acara.
      </p>
    </main>
  );
}
