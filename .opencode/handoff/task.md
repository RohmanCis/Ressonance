# Task: Phase 2 — Guest Flow Redesign (DESIGN.md P1)

## Authority

- `DESIGN.md` (root) is CANONICAL — §2 tokens, §3 typography, §4 motion, §5 guest flow, §7 component inventory. Read it first.
- `UX_FLOW.md` (root) is the flow reference (state behavior notes; visual authority is DESIGN.md).
- Backend, API, migrations, `app/api/**`, `supabase/`, `docs/` are LOCKED — do not touch.
- Phase 1 already landed (uncommitted): dark tokens + font variables in `app/globals.css`, `app/layout.tsx`. Tailwind v4 — tokens exposed via `@theme inline` (e.g. `bg-bg-base`, `text-text-primary`, `bg-accent`, `text-accent`, `border-border`, `bg-overlay`, `font-display` = Cormorant, `font-mono` = DM Mono, `duration-fast/base/slow`).

## Objective

Implement the guest-side redesign per DESIGN.md §5 and §7 (P1 rows only). Two parts:

### Part A — Structural: voice becomes an inline panel (the known gap)

DESIGN.md §5.3: audio recorder is a bottom slide-up panel ON the Capture screen — never a separate screen. Current code has a separate `"voice"` ViewState screen (`components/guest/screens/VoiceAndMessage.tsx`).

1. Remove the `"voice"` screen state from `components/guest-event-entry.tsx`. Voice state machine (record/review/submit/skip/error handlers) stays in `guest-event-entry.tsx`, unchanged semantically — reuse it.
2. Rename `components/guest/screens/VoiceAndMessage.tsx` → `components/guest/screens/AudioRecorderPanel.tsx` (export `AudioRecorderPanel`). Redesign as bottom slide-up panel per DESIGN.md §5.3: 350ms ease-out `translateY(100%) → 0`, covers bottom ~60%, `bg-bg-elevated` surface, `--overlay` scrim behind, header "Voice note", recording state (label + DM Mono elapsed timer + stop), review state (playback bar `audio[aria-label="Voice note playback"]`, duration, re-record / submit), skip link "Lewati & kirim foto saja", close/dismiss affordance. No screen change ever occurs while it is open.
3. Capture screen (`components/guest/screens/Capture.tsx`): add bottom-right mic icon trigger (44px+ hit area, visible label "Voice note") that opens the panel. Hide/disable trigger when `session.voice_note_available` is false. Panel never blocks capture while closed.
4. Flow wiring: photo-review "sync-then-advance" now advances to `done` (photos-only finish is valid — voice was already available inline). Voice submit success or skip → `done`. Voice submit/skip is reachable ONLY from the panel on Capture. Keep the deferred-advance race fix (`advancePendingRef`) semantics — it now targets `done`.
5. Session-expiry behavior: unsent voice takes discarded on expiry (unchanged). Expiry while panel open → panel resets, back to PreSession.

### Part B — Visual: restyle all guest screens on dark tokens

Per DESIGN.md §5.1–§5.4:

- `PreSession.tsx` — §5.1: `--bg-surface` card max-w-30rem, Cormorant 4xl event title, DM Sans xs eyebrow, `--border` underline name field, 48px gold full-width Start, quiet bordered expiry/error blocks. Keep ALL existing states/messages/logic (closed, not-found, rate-limited, invalid, offline, carry-over).
- `FrameSelection.tsx` — §5.2: full-screen, Cormorant 3xl heading, 2-col 9:16 card grid on `--bg-surface` with `--border` hairline, selected = gold 2px border + `--accent-soft` fill + gold check badge, bottom-pinned CTA + safe-area, "Skip — no frame" quiet link. PRESERVE radio-group a11y (arrow keys, roving tabindex, aria-checked) exactly.
- `Capture.tsx` — §5.3: fullscreen viewfinder hero (100dvh minus safe areas), translucent top bar (`--overlay`) with event title + guest name, DM Mono "N / M" counter on overlay pill (right-aligned below top bar), 72px gold shutter with `--bg-base` ring + safe-area clearance, pending strip of ~48px thumbnails above shutter with per-item status, shutter press = 150ms scale 1→0.92→1 + brief flash overlay. Disabled shutter at limit (reduced opacity + text hint). Keep file-picker fallback and full-size review overlay (delete/retake).
- `PhotoReview.tsx` — §5.3 last bullet: grid, per-item delete/retry, sync-then-advance CTA — restyled on dark tokens, behavior unchanged. CTA copy advances to done (e.g. "Kirim" — your call, keep Indonesian tone consistent with existing copy).
- `Done.tsx` — §5.4: quiet centered, gold check glyph (not animated), Cormorant 4xl event title, two short receipt lines. No actions.
- `post-session-loading` inline screen in `guest-event-entry.tsx` — restyle on dark tokens.
- Motion: CSS transitions only, transform+opacity only, `--motion-*` durations, ease-out in / ease-in out. Nothing from §4 "never animates" list animates.
- A11y is non-negotiable: focus-visible rings (gold), aria-live/status regions preserved, 48px guest primaries, 44px+ secondaries, safe-area insets, tabular figures on counters (DM Mono).
- Text on gold fills is `#0d0d0f` (use `text-[#0d0d0f]` or a token if you add one — no other inline color literals; all other colors via tokens).

## Also update

- `e2e/mobile-media-qa.spec.ts` — rewrite selectors/flow for: voice panel on Capture (open panel → record → submit/skip), photo-review CTA now advances to done. Keep every test scenario's behavioral assertion (sync-then-advance, upload errors, re-record, auto-stop 30s, expiry, carry-over, session usage). Do not weaken coverage.
- Do NOT touch `e2e/smoke.spec.ts`, `qr-qa.spec.ts`, `print-qa.spec.ts`, `admin-index.spec.ts`, `components/admin/**` (P3, later phase), `components/frame-selector.tsx` (legacy, later), `app/api/**`, `lib/**`, `hooks/**`, `supabase/**`, `docs/**`.
- If you need an extra token/utility mapping in `app/globals.css` `@theme inline`, you may add it (no token value changes).

## Validation (run all, in this order, serially — one lane)

1. `npx tsc --noEmit` — must pass.
2. `npx vitest run` — must stay 344/344.
3. `npm run e2e` — all suites must pass (known acceptable: none; if a spec fails for a pre-existing reason, report it, do not mask it).
4. `npm run lint` — no NEW errors (baseline: 1 pre-existing `any` in `e2e/print-qa.spec.ts`).

## Report

Write `result.md`: status, files changed, structural decisions (voice wiring), e2e changes summary, validation results (each command), deviations from DESIGN.md if any (should be none), unresolved risks.
