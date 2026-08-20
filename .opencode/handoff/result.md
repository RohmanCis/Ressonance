# Result: Phase 2 — Guest Flow Redesign (DESIGN.md P1)

## Status: PASS

Implementation: @designer (des-1, cancelled mid-validation after stalling — code complete on disk). Reconciliation, flakiness triage, and full validation: orchestrator.

## Files changed (13)

- `components/guest/screens/AudioRecorderPanel.tsx` — NEW (replaces VoiceAndMessage.tsx): bottom slide-up panel per DESIGN.md §5.3 — 60dvh `bg-bg-elevated` panel over `bg-overlay` scrim, `duration-slow` (350ms) `translate-y` ease-out/ease-in, `role="dialog"` + `aria-modal`, header/close button, recording state (label + DM Mono tabular elapsed + stop), review state (`audio[aria-label="Voice note playback"]`, duration, re-record/submit), skip link "Lewati & kirim foto saja", safe-area insets.
- `components/guest/screens/VoiceAndMessage.tsx` — DELETED (rename per DESIGN.md §7).
- `components/guest-event-entry.tsx` — `"voice"` ViewState removed; `voicePanelOpen` state renders AudioRecorderPanel alongside Capture (never a screen change); photo-review sync-then-advance now targets `done` (deferred-advance race fix preserved); `handleVoiceSkip`/submit → `done`; leaving Capture or expiry closes the panel and discards unsent takes (§4.6); SESSION_STATES drops "voice". Voice state machine logic semantically unchanged.
- `components/guest/screens/Capture.tsx` — fullscreen viewfinder hero, translucent top bar, DM Mono "N / M" counter pill, 72px gold shutter + safe-area, pending strip with per-item status, bottom-right mic trigger ("Voice note", 44px+) opening the panel (hidden when voice unavailable), shutter press feedback. File-picker fallback + full-size review overlay retained.
- `components/guest/screens/PreSession.tsx`, `FrameSelection.tsx` (radio-group a11y preserved), `PhotoReview.tsx`, `Done.tsx` — restyled on dark tokens per §5.1/§5.2/§5.3/§5.4.
- `app/globals.css` — `--on-accent: #0d0d0f` added (text on gold fills, §2) + `--color-on-accent` exposure. No token value changes.
- `e2e/mobile-media-qa.spec.ts` — rewritten for the new flow: `openVoicePanel()` helper asserts dialog opens AND Capture heading persists; photo-review CTA advances to done; all prior behavioral scenarios retained (sync-then-advance, upload errors, re-record, auto-stop 30s, D2 stale-closure fix, expiry, carry-over, usage re-sync, limit/disable). Coverage not weakened: 18 guest tests (was 18).

## Validation (orchestrator-run, serial — AGENTS.md single-lane rule)

- `npx tsc --noEmit` — PASS
- `npx vitest run` — 344/344 PASS (43 files)
- `npx playwright test --workers=1` — **39 passed, 0 failed**, 1 skipped (live-DB test), (4.3m→3.3m serial)
- `npm run lint` — 1 pre-existing error (`e2e/print-qa.spec.ts:34` `any`) + 12 warnings (clean tree: 11; the 1 new is a `no-img-element` warning for PhotoReview's object-URL preview `<img>`, same class as 8 pre-existing baseline ones — object URLs can't use next/image)
- `npm run build` — PASS

## Flakiness triage (designer's "failures")

Designer's e2e runs used default 4 workers; intermittent failures (frame-selection, admin Open, D2) varied run-to-run. Verified NOT code regressions: clean tree (stash) passed the same specs; full suite with `--workers=1` passes 39/39 on the WIP tree. Root cause: 4 parallel workers against the single shared port-3000 dev server exceed 30s test timeouts on first-compile latency. AGENTS.md already mandates one lane at a time — serial (`--workers=1`) is the correct invocation.

## Deviations / risks

- None vs DESIGN.md. Owner-facing copy reviewed: panel/CTA copy is grounded Indonesian, consistent with existing tone ("Kirim semua", "Rekam ulang", "Lewati & kirim foto saja").
- Pre-existing: admin (P3) and legacy `frame-selector.tsx` (P2) not yet restyled — later phases.
- 4-worker e2e flakiness predates this work (dev-server contention); if it recurs, consider `workers: 1` in playwright.config or retries — owner decision, not made here.

## Next step

Owner review/commit. Then Phase 3 candidates: admin dark-token restyle (P3), legacy frame-selector retirement (P2).
