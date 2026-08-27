"use client";

import { useLowPowerAmbient } from "@/hooks/use-low-power-ambient";

/**
 * Ambient backdrop (DESIGN.md §2): two blurred gold orbs + film grain behind
 * page content. Shared by the admin Shell (printHidden) and the guest
 * PreSession shell. Low-power devices skip the animations and the grain.
 */
export function AmbientBackdrop({ printHidden = false }: { printHidden?: boolean }) {
  const lowPower = useLowPowerAmbient();
  const hide = printHidden ? " print:hidden" : "";
  return (
    <>
      <div aria-hidden="true" className={`pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-[100px]${hide} ${lowPower ? "" : "animate-ambient-1"}`} />
      <div aria-hidden="true" className={`pointer-events-none absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[110px]${hide} ${lowPower ? "" : "animate-ambient-2"}`} />
      {!lowPower && <div aria-hidden="true" className={`pointer-events-none absolute inset-0 film-grain${hide}`} />}
    </>
  );
}
