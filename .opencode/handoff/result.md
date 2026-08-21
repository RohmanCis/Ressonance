# Result — Bounded cleanup post-audit (2026-08-21)

## Status
COMPLETE — all 4 scoped items done, no out-of-scope changes.

## Files changed
- `AGENTS.md` (§12): stale `VoiceAndMessage.tsx` → `VoiceRecordingScreen.tsx`; QA metrics refreshed — vitest 353/353 (43 files) PASS, Typecheck PASS, Playwright E2E 39 passed / 1 skipped / 0 failed (2026-08-21, post-redesign d313372). Lint claim untouched (baseline). All other §12 content intact.
- `app/globals.css`: deleted unused `.bg-espresso-mesh` (incl. its comment header), `.gold-foil-text` (incl. comment header), `.vignette-overlay` (incl. comment header). Grep-verified zero usage outside globals.css. No keyframes affected (these classes used no keyframes).
- `components/guest/screens/PreSession.tsx`: removed dead `onCarryOver?: () => void` prop (line 37).
- `components/guest-event-entry.tsx`: removed no-op `onCarryOver={() => {}}` (line 507).
- `lib/audio-file.ts`: removed `export` from `VOICE_NOTE_MIME_TYPES` (still used internally at `VoiceNoteMimeType` line 17). No external importers exist.
- `package.json`: added `"frames:generate": "node scripts/generate-frames.mjs"` (script target `scripts/generate-frames.mjs` confirmed to exist).
- `lib/submit-photo.ts`: added PHOTO_LIMIT comment (server → client copy note).
- `lib/get-session-usage.ts`: added PHOTO_LIMIT comment (server → client copy note).
- `lib/pending-photos.ts`: added PHOTO_LIMIT comment (client → server copies note).

## Validation
- `npm run typecheck` — PASS (exit 0).
- `npm test` — PASS: 43 files, 353/353 tests (matches expected).
- E2E not re-run (read-only contract; no behavior change; metrics sourced from §12 baseline d313372).

## Blockers
None.

## Assumptions
- Exact comment wording for the 3 PHOTO_LIMIT sites not prescribed by task; used the quoted phrase verbatim for server files and a mirrored reverse-phrase for the client file, matching one-line `//` style in lib/*.ts.
- §12 QA paragraph rewrite: dropped stale parenthetical "(2026-08-20, post ADR-012 deepening; feature removal dropped 4 test files and 51 tests)" as it contradicts refreshed metrics; kept the lint baseline sentence verbatim.
- `.gold-foil-btn` NOT removed — not in scope (still used by PreSession CTA).

## SSOT conflict
None observed. Task line references match actual file state (verified before editing).

## Next step
Orchestrator reconcile; no drift expected — typecheck + full vitest green.
