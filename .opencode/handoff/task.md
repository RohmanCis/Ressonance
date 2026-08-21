# Task

# TASK: Bounded cleanup post-audit (owner-approved 2026-08-21)

## Scope (exactly 4 items, nothing else)
1. **AGENTS.md §12** (line ~181 and QA paragraph): replace stale `VoiceAndMessage.tsx` reference with `VoiceRecordingScreen.tsx`; refresh QA metrics: vitest **353/353 PASS (43 files)**, Typecheck PASS, Playwright E2E **39 passed / 1 skipped / 0 failed (2026-08-21, post-redesign d313372)**. Lint claim unchanged (baseline). Keep all other §12 content intact.
2. **app/globals.css**: delete unused classes `.bg-espresso-mesh` (line ~132), `.gold-foil-text` (line ~164), `.vignette-overlay` (line ~179) including their comment headers/keyframe deps if referenced only by these. If any keyframes (e.g. used by these classes only) become orphaned, delete those too — verify no other usage first.
3. **Dead prop**: remove `onCarryOver?: () => void` from `components/guest/screens/PreSession.tsx:37` and the no-op `onCarryOver={() => {}}` at `components/guest-event-entry.tsx:507`.
   **Unexport internal**: `lib/audio-file.ts:11` remove `export` from `VOICE_NOTE_MIME_TYPES` (still used internally at line ~17).
   **package.json**: add script `"frames:generate": "node scripts/generate-frames.mjs"`.
4. **PHOTO_LIMIT documentation**: keep the 3 separate literals (`lib/submit-photo.ts:26`, `lib/pending-photos.ts:11`, `lib/get-session-usage.ts:44`) — separation is intentional (server vs client bundle). Add a one-line `//` comment at each of the 3 sites: server files note "client copy in lib/pending-photos.ts (kept separate to avoid server deps in client bundle)"; client file notes the reverse. Match existing comment style in lib/*.ts.

## Constraints
- Read-only for everything outside scope. No doc changes beyond AGENTS.md §12 items listed.
- No behavior changes; typecheck + vitest must stay green.

## Validation (run all, report results)
- `npm run typecheck`
- `npm test` (expect 353/353)

## Output
Write result.md: status, files changed, validation results, blockers.
