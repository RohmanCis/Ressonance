"use client";

import { RefObject, useCallback } from "react";

/**
 * Tab/Shift+Tab focus trap for hand-rolled dialogs. Radix overlays own
 * their trap — do not use there. Returns an onKeyDown handler for the
 * dialog panel; non-Tab keys pass through untouched so callers can chain
 * their own key handling first (Escape, arrows, …).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [ref],
  );
}
