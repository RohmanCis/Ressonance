"use client";

import { useEffect, useState } from "react";

/**
 * Low-power ambient tier. Returns true on low-end devices so ambient
 * layers (orb animation, film grain) can be reduced: orbs render static
 * and grain is skipped. Detection runs post-mount, so the first paint
 * always shows the full ambient system and never shifts layout.
 * prefers-reduced-motion stays handled in CSS (globals.css).
 */
export function useLowPowerAmbient(): boolean {
  const [lowPower, setLowPower] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    const saveData = nav.connection?.saveData === true;
    setLowPower(cores <= 4 || memory <= 4 || saveData);
  }, []);
  return lowPower;
}
