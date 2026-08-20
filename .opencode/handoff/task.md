# Task: Refactor Guest Flow to 6-Step Sequential Pipeline (Voice as Dedicated Screen)

## Authority & Context

**Canonical Documents (updated 2026-08-21 per owner resolution):**
- `docs/PRD.md` §1.3 Amendment: sequential full-screen flow authority
- `DESIGN.md` §2–§4 (tokens, typography, motion), §5.1–§5.6 (6-step guest flow), §7 (component inventory) — CANONICAL
- `UX_FLOW.md` — updated sequence: PRE_SESSION → FRAME_SELECT → CAPTURE → PHOTO_REVIEW → VOICE_NOTE → DONE
- `AGENTS.md` §6 (code style), §11 (testing gate)

**Owner Resolution:** Voice recorder changes from slide-up panel to dedicated full-screen VOICE_NOTE state. "No screen change" constraint removed. PRD authority (rank 1) supersedes prior DESIGN.md panel constraint.

**Invariants (unchanged):**
- 30-min HttpOnly GuestSession, max 5 photos, max 1 voice note (5–30s), backend limits authoritative
- Dark tokens: `#0d0d0f` base, `#f0ebe0` text, `#c8a96e` accent
- Typography: Cormorant Garamond headings, DM Sans body, DM Mono counters/timers
- Motion: CSS transitions only (`--motion-fast/base/slow`), `prefers-reduced-motion` respected

## Objective

Refactor guest flow from 5-step (camera with audio panel) to 6-step sequential pipeline:

1. **PRE_SESSION** (unchanged)
2. **FRAME_SELECT** (unchanged)
3. **CAPTURE** — remove mic trigger button, remove `AudioRecorderPanel` rendering, pure camera-only screen
4. **PHOTO_REVIEW** — update CTA copy to reflect next step ("Kirim & Lanjut"), advance to VOICE_NOTE after sync
5. **VOICE_NOTE** (NEW dedicated full-screen) — refactor `AudioRecorderPanel` into full-screen `VoiceRecordingScreen`
6. **DONE** (unchanged)

## Scope of Changes

### 1. `components/guest-event-entry.tsx`

- **Type updates:**
  - Extend `ViewState` union: add `"voice-note"` as a new state value
  - Keep existing `VoiceState` type unchanged (recording/review/submitting/etc.)

- **State changes:**
  - Remove `voicePanelOpen` state variable (line ~75)
  - Remove all `setVoicePanelOpen` calls and logic
  - Keep voice recording state (`voice`, `voiceUrl`, `voiceState`, `voiceMessage`, `voiceSeconds`, refs) — behavior unchanged

- **Flow transitions:**
  - `handleReviewNext` (photo review sync completion): change advance from `setState("done")` to `setState("voice-note")`
  - `submitVoice` (voice upload success): change advance to `setState("done")`
  - `handleVoiceSkip` (voice skip): change advance to `setState("done")`

- **Render logic:**
  - Remove `AudioRecorderPanel` conditional render from the Capture screen section
  - Add new conditional: `{state === "voice-note" && <VoiceRecordingScreen ... />}`
  - Pass required props: `event`, `session`, voice state/handlers (`voiceState`, `voiceSeconds`, `voiceUrl`, `voiceMessage`, `onRecord`, `onStop`, `onReset`, `onSubmit`, `onSkip`)

- **Camera teardown:**
  - Ensure `camera.stop()` is called when leaving `"post-session"` state (entering photo-review or later)
  - MediaStream tracks must be released before VOICE_NOTE screen to avoid resource leaks

### 2. `components/guest/screens/Capture.tsx`

- Remove `onOpenVoicePanel` prop from component signature
- Remove mic trigger button (bottom-right icon button with "Voice note" label)
- Keep: viewfinder, frame overlay, photo counter, 72px shutter, pending thumbnail strip, "Lanjut" CTA
- Visual/behavior unchanged otherwise

### 3. `components/guest/screens/PhotoReview.tsx`

- Update primary CTA button text from "Kirim" to "Kirim & Lanjut" (or similar copy reflecting next step)
- On successful sync completion, delegate transition to parent via `onNext` callback — parent will advance to VOICE_NOTE
- No other changes

### 4. `components/guest/screens/VoiceRecordingScreen.tsx` (refactor from `AudioRecorderPanel.tsx`)

**File operation:** Rename/refactor `AudioRecorderPanel.tsx` → `VoiceRecordingScreen.tsx`

**Design (DESIGN.md §5.5):**

- **Layout:** Full-screen `<main>` element, `100dvh`, `--bg-base`, safe-area padding (`env(safe-area-inset-*)`)
- **Header:** Event title eyebrow (text-xs, `--text-muted`) + Cormorant Garamond 3xl/4xl heading ("Tinggalkan Pesan Suara")
- **Center Stage:**
  - Gold mic button: `h-20 w-20`, `bg-accent`, rounded-full, centered vertically
  - DM Mono timer: `00:00 / 00:30` format, below mic button
  - Recording status label: "Recording" (pulse-free, no animation), `--text-primary`
- **Recording state:**
  - "Recording" label visible
  - Elapsed timer updates every second
  - Square stop button (replaces mic button when recording)
- **Review state:**
  - Audio player preview: HTML5 `<audio controls>` or custom playback UI
  - Duration display (DM Mono)
  - Duration check: if `voiceSeconds < 5`, show warning text ("Pesan terlalu singkat — minimal 5 detik")
  - "Rekam Ulang" button (secondary styling, `bg-bg-surface`, `border-border`)
  - Primary gold CTA: "Kirim Pesan Suara" (`bg-accent`, `text-on-accent`)
- **Skip action:**
  - "Lewati — Kirim Foto Saja" text link, `text-text-secondary`, `hover:text-text-primary`
  - Positioned below primary CTA
  - Calls `onSkip` prop, parent advances to DONE
- **State cleanup:**
  - On unmount or reset: revoke `voiceUrl` object URL if present
  - Stop MediaRecorder if active
  - Clear intervals/timers

**Props (matching existing AudioRecorderPanel signature):**
```typescript
{
  event: EventData;
  session: SessionData;
  voiceState: VoiceState;
  voiceSeconds: number;
  voiceUrl: string;
  voiceMessage: string;
  onRecord: () => void;
  onStop: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onSkip: () => void;
}
```

No `onClose` prop — screen exits only via submit/skip advancing to DONE.

**Accessibility:**
- Focus heading on mount (`useEffect`, `headingRef.current?.focus()`)
- Gold focus rings on all interactive elements (`focus-visible:outline-2 outline-offset-2 outline-accent`)
- Announce state changes via `aria-live="polite"` status region
- 48px+ touch targets on mobile (mic button already `h-20 w-20` = 80px)

### 5. Update imports in `guest-event-entry.tsx`

```typescript
// Old:
import { AudioRecorderPanel } from "@/components/guest/screens/AudioRecorderPanel";

// New:
import { VoiceRecordingScreen } from "@/components/guest/screens/VoiceRecordingScreen";
```

## Hard Constraints

1. **E2E selector stability:** Guest flow specs (`e2e/*.spec.ts`) may reference accessible names/labels — preserve button labels, heading text, aria-labels where tests depend on them. If uncertain, inspect `e2e/` before changing copy.

2. **No behavior changes beyond flow sequence:** Voice recording logic (MediaRecorder, duration validation, upload API call) stays identical. Only the presentation (panel → screen) and transition timing (photo-review → voice-note → done) change.

3. **TypeScript strict:** No `any` in new/changed code. All state transitions type-safe.

4. **Existing voice handlers unchanged:** `submitVoice`, `handleVoiceSkip`, `startRecording`, `stopRecording`, MediaRecorder lifecycle — reuse as-is; only the calling context (screen vs panel) changes.

5. **Camera resource cleanup:** Explicitly stop camera MediaStream when transitioning from CAPTURE to PHOTO_REVIEW or beyond. Verify `camera.stop()` is called before VOICE_NOTE mounts.

## Verification Gates (run serially, in order)

1. `npm run typecheck` (`tsc --noEmit`) — must pass
2. `npm test` (`vitest run`) — 344/344 tests (or adjusted count if new tests added)
3. `npm run build` — must pass
4. `npm run e2e` (Playwright, `--workers=1`) — guest flow specs must pass (smoke, qr-qa; print-qa unrelated)
5. `npm run lint` — baseline only (1 pre-existing `any` in `e2e/print-qa.spec.ts` + pre-existing warnings)

If any gate fails: fix and re-run that gate plus all subsequent gates. Do not skip steps.

## Deliverables

Write `.opencode/handoff/result.md`:

- **Status:** COMPLETE / BLOCKED / PARTIAL
- **Files changed:** list with line counts
- **Validation results:** per-gate outcomes (PASS/FAIL + relevant output)
- **Camera cleanup verification:** confirm MediaStream teardown timing
- **E2E impact:** any test updates required (if specs broke, note which and why)
- **Deviations:** any departures from this spec (should be none without approval)
- **Unresolved risks:** blockers, missing requirements, or follow-up needed

## Design Notes

- **Copy:** Retain Indonesian labels/copy where present ("Tinggalkan Pesan Suara", "Rekam Ulang", "Kirim Pesan Suara", "Lewati — Kirim Foto Saja") per existing convention
- **Motion:** Screen transitions use `--motion-base` (250ms); no panel slide animations remain
- **Error states:** Voice upload errors stay inline (existing `voiceMessage` rendering); no modal/overlay needed
- **Session expiry:** If session expires during VOICE_NOTE, existing expiry handler applies (discard unsent take, return to landing with carry-over prompt)

---

**Authority conflicts:** Resolved per owner decision 2026-08-21. PRD §1.3 supersedes prior DESIGN.md panel constraint. DESIGN.md and UX_FLOW.md updated before this task.

**Next task after completion:** Orchestrator reconciles result, runs validation, updates AGENTS.md §12 current state if all gates pass.
