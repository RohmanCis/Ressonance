# Current Task Status

**Status:** IDLE — T040 completed 2026-08-29 (commit proposal pending owner).

## Session record (T040, owner decision 2026-08-29)
Event-title text stamp removed from captured photos: every frame in `lib/frames.ts`
registers `textLayers: []` (frame artwork only); `lib/frames.test.ts` invariant updated
(no layers on any frame, 6/6 PASS, re-verified); DESIGN.md §5.2 synced (title clauses
removed, composition model rewritten). Compositing machinery kept (FrameTextLayer type
export, no cascade). tsc PASS (re-verified).
Root cause of "wedding" on photos: dynamic eventTitle layer drawn at shutter
(guest-event-entry.tsx:257 → lib/frame-compositing.ts:136) — the test event was named
"Wedding"; confirmed by owner's no-frame test (clean, no layers). flower.png is CLEAN —
earlier baked-text claim RETRACTED. wedding-crimson remains the only baked-text asset.

## Session record (T039, owner-directed)
Event title removed from post-capture UI: Done.tsx h1 → `sr-only` (screen-reader heading +
phase-4 focus target preserved; no visible title). FrameSelection.tsx:97 hardcoded
"Wedding Keepsake" fallback removed. tsc PASS. No e2e assertions affected.

## Session record (T038 + T038-QA)
T038: Done.tsx owner SVG (180×110), w-[200px] wrapper/photo, de-chromed keepsake card.
T038-QA: guest-flow review (oracle; qa model 403'd ×2). Findings: 2 HIGH (mic stream +
voice timer leak on unmount, guest-event-entry.tsx:495–501), 8 MEDIUM, 3 LOW. Full table
in result.md archive below. `hooks/use-audio-recorder.ts` does not exist — voice logic
inlined in guest-event-entry.

## Open owner decisions
- COMMIT PROPOSAL (single, T035–T040 guest Done/frame wave):
  `feat(guest): Done screen analog-print redesign + remove event-title stamp from frames`
  Body: thermal-print reveal (5s) + slide-up settle + bokeh orbs/light leaks/film grain +
  detailed camera SVG (200px photo) + de-chromed keepsake card + sr-only Done title +
  FrameSelection fallback removed + all frame textLayers emptied (owner decision
  2026-08-29: no title stamp on captured photos; warm leak hexes = ratified non-token
  analog palette). Includes DESIGN.md §5.2 sync + frames.test.ts invariant.
- QA findings triage: HIGH pair is a one-line fix (stopVoiceTimer + finishRecording in
  unmount cleanup) — recommend dispatching before deploy.
- DESIGN.md §5.6 still describes the older T034 eject sequence + gold check + visible
  Cormorant title on Done (now thermal-print, no check, sr-only title) — needs
  owner-approved §5.6 sync.

## Uncommitted working tree (owner decision: not committed)
- T035–T040: `components/guest/screens/Done.tsx`, `app/globals.css`, `lib/frames.ts`,
  `lib/frames.test.ts`, `components/guest/screens/FrameSelection.tsx`, `DESIGN.md` (§5.2)
- T034 (pre-existing): `DESIGN.md`, `components/guest-event-entry.tsx`
- T032: `lib/admin-media-repo.ts`, `test/admin-media-db.ts`, `submissions/route.test.ts`
- T033: `component-catalog.html`
- `package.json` / `package-lock.json` (perf devDeps), `e2e/*-perf.mjs`, `.opencode/handoff/*`

## Outstanding
- 3 perf commits local/unpushed: `839e871`, `b9b00ae`, `fae60ba`.
- Live-DB re-verification of ILIKE at next `npm run test:postgres` window.
- E2E not run for T035–T040 (per briefs) — run `npm run e2e` at next QA window.
  Note: full vitest suite not re-run after T040 (focused frames suite 6/6 only).
- Pre-deploy blockers: `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.

## Next task
Idle. Recommended: QA HIGH-fix dispatch (mic/timer leak).
