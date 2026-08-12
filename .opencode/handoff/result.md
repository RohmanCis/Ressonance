# Result — T023 D1/D2 Voice Defect Fixes

## Status
DONE. Both defects fixed and verified. Awaiting independent QA.

## Changes
File: `components/guest-event-entry.tsx` ONLY.

### D1: Voice upload error retains review UI
- Added `"review-error"` to `VoiceState` union type.
- Upload error handlers (`request.onload` catch, `request.onerror`, generic catch) now set `voiceState` to `"review-error"` instead of `"error"`.
- `"review-error"` routes to the existing review branch (audio playback + duration + Submit + Re-record), with the error message displayed via `{state === "review-error" && <p role="alert">{message}</p>}`.
- Permission error (`recordVoice` catch) still uses `"error"` → idle branch (correct: no audio to retain).
- Replaced dead `{isError && ...}` in review branch with `{state === "review-error" && ...}`.

### D2: Voice onstop stale closure fixed
- Added `voiceSecondsRef = useRef(0)` alongside existing `voiceSeconds` state.
- `recordVoice()`: resets `voiceSecondsRef.current = 0` at record start.
- Interval callback: writes `voiceSecondsRef.current = next` on each tick.
- `recorder.onstop`: reads `voiceSecondsRef.current` instead of stale `voiceSeconds` closure for the "Too short" hint decision.
- Duration display unchanged (already correct via `seconds` prop).

## Verification
| Check | Result |
|---|---|
| `npm run typecheck` | PASS (clean) |
| `npm run lint` | 0 errors, 5 pre-existing warnings |
| `npm test` (vitest) | 27/27 files, 232/232 tests PASS |
| `npm run build` | Compiled successfully |
| Playwright mobile-media QA | 10/10 PASS (D1+D2 fix tests included) |
| Playwright smoke | 3 passed / 1 skipped / 0 failed |

### D1 fix test (test 7)
"voice: upload error retains audio, duration, Re-record, and Submit" — PASS
- Error message visible
- `<audio>` playback retained
- Duration displayed
- Re-record button available
- Submit (retry) button available
- "Record" (idle) button NOT shown

### D2 fix test (test 10)
"voice: onstop hint uses actual duration, not stale closure" — PASS
- 6s recording: "Too short" NOT shown (correct: 6s >= 5s)
- "Keep recording for at least 5 seconds" guidance NOT shown
- Duration display: "6s" (correct)

## SSOT conflict
None. No canonical document or API behavior changed.

## Architecture drift
None. UI-only state change; no new endpoint, schema field, or dependency.

## Blockers
None.

## Next step
Independent QA review, then commit when approved.
