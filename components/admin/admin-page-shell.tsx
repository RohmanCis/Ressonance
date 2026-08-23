"use client";

import type { ReactNode } from "react";

// Page-level eyebrow + Cormorant title, aligned with the guest baseline
// (DESIGN.md §3 scale: 3xl admin page title, 0.04em sentence-case eyebrow).
export function AdminPageShell({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div>
      {eyebrow && <p className="text-xs font-medium tracking-[0.04em] text-text-muted">{eyebrow}</p>}
      <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">{title}</h1>
      {children}
    </div>
  );
}
