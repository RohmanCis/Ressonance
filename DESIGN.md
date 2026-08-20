# DESIGN.md — Dark Analog-Film Redesign Proposal

**Status:** CANONICAL — approved 2026-08-20. Single source of truth for all UI/design decisions. This document supersedes the former light "memory-table" system (docs/UI_DESIGN.md and docs/UI_UX.md, now deleted). No backend, API, schema, or flow-authority change is involved.

Owner design decisions (2026-08-20, locked): frame picker as a separate screen before camera; a completion/Done screen after all submissions; admin full redesign on the same dark tokens; branding by event name only (no logo); Cormorant Garamond headings, DM Sans body, DM Mono for counters/timers; `#0d0d0f` background, warm off-white `#f0ebe0` text, warm gold `#c8a96e` as the only accent; camera fullscreen as hero; audio recorder as a slide-up panel (no screen change); mobile-first; CSS transitions only (transform + opacity); `prefers-reduced-motion` respected on all animations.

---

## 1. Design Philosophy

The experience should feel like handling a roll of film at a wedding table at night: one warm lamp, deep shadow, and the photograph as the only bright thing in the room. Interfaces stay nearly invisible — matte black surfaces, quiet off-white type, and a single warm gold accent reserved for the moments that matter: the shutter, the confirm, the completed send. Cormorant Garamond gives event titles the engraved-invitation softness of a printed keepsake, while DM Mono counters tick like a film camera's frame counter. Every transition is a physical gesture — a panel slides, a thumbnail settles — nothing decorative, nothing that delays understanding.

## 2. Color Tokens

```css
:root {
  --bg-base: #0d0d0f;        /* page background — near-black, slightly cool */
  --bg-surface: #151518;     /* cards, panels, review tiles */
  --bg-elevated: #1c1c21;    /* slide-up audio panel, dialogs, popovers */
  --text-primary: #f0ebe0;   /* warm off-white ink */
  --text-secondary: #c9c2b4; /* supporting copy, labels */
  --text-muted: #8a8478;     /* hints, timestamps, placeholders */
  --accent: #c8a96e;         /* warm gold — actions, active states ONLY */
  --accent-soft: rgba(200, 169, 110, 0.14); /* selected-frame glow, active fills */
  --error: #c0564f;          /* destructive / upload failure */
  --success: #7da37a;        /* confirmed persistence */
  --border: rgba(240, 235, 224, 0.12); /* hairline dividers, field edges */
  --overlay: rgba(0, 0, 0, 0.6);        /* scrims behind panels and previews */
}
```

Rules: gold is the only accent and appears only on primary actions, focus rings, and confirmed/active states. Errors and successes never use gold. Text on `--accent` fills is `#0d0d0f`. All contrast pairs (primary text on base, secondary on surface, accent on base) target WCAG AA.

## 3. Typography

Google Fonts (single request):

```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&display=swap
```

| Family | Role | Weights |
|---|---|---|
| Cormorant Garamond | Event titles, headings, Done screen | 400, 500, 600, 700 (+ italic 400) |
| DM Sans | Body, labels, buttons, admin data | 400, 500, 700 |
| DM Mono | Counters, timers, elapsed time, file metadata | 400, 500 |

Scale (rem, with clamp for fluid guest titles):

| Token | Size | Use |
|---|---|---|
| xs | 0.75rem | Metadata, timestamps, counters |
| sm | 0.875rem | Helper text, admin table cells |
| base | 1rem | Body, inputs, buttons |
| lg | 1.125rem | Card titles, section labels |
| xl | 1.25rem | Admin section headings |
| 2xl | 1.5rem | Guest sub-headings |
| 3xl | 2rem | Guest screen headings, admin page title |
| 4xl | 3rem | Event title on Landing and Done (Cormorant Garamond 600) |

Counters and timers always use DM Mono with tabular figures. Sentence case everywhere; labels may use `0.04em` tracking.

## 4. Motion Principles

```css
:root {
  --motion-fast: 150ms; /* presses, hovers, focus */
  --motion-base: 250ms; /* panel settle, thumbnail appear */
  --motion-slow: 350ms; /* audio slide-up panel, screen transitions */
}
```

Easing: `ease-out` for entering (panels rising, thumbnails fading in), `ease-in` for exiting. Only `transform` and `opacity` animate — never layout properties.

**What animates:**
- Audio recorder panel: slide-up from bottom, `--motion-slow` (350ms) ease-out, `translateY(100%) → translateY(0)`.
- Shutter press: scale `1 → 0.92 → 1` over `--motion-fast`, plus a brief opacity flash overlay.
- Frame selection: selected card settles with a `--motion-fast` scale/border crossfade; focus ring fades in.
- Photo thumbnail appear: new pending-strip item fades and slides in (`--motion-base`).

**What never animates:**
- Form inputs and fields (no animated borders or floating labels).
- Error messages and alerts (appear instantly).
- Loading skeletons (static pulse only, or none).
- API-response-driven state changes (sync statuses, counters, usage updates).

**prefers-reduced-motion:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

All state changes remain instant and announced; only the movement is removed.

## 5. Guest Flow

### 5.1 Landing (Pre-Session)

- **Layout:** Mobile-first single column, content vertically centered with generous top space. `--bg-base` page; a `--bg-surface` card (max-width `30rem`) holds the session form. Event name set in Cormorant Garamond 4xl, no logo, no imagery.
- **Key visual elements:** Eyebrow line ("You're invited" style context, DM Sans xs, `--text-muted`); event title; one-sentence helper on the optional name; name field with `--border` underline styling on `--bg-surface`; expiry/carry-over and error messages as quiet bordered blocks.
- **Primary action placement:** Start button full-width at the bottom of the card, 48px high, gold fill (`--accent`) with `#0d0d0f` text. Single obvious action.
- **Transition:** On successful Start, screen fades/slides out (opacity + slight translateY, `--motion-base`) into Frame Selection.

### 5.2 Frame Selection

- **Layout:** Full-screen `--bg-base`. Heading (Cormorant 3xl) + one helper line at top; 2-column card grid below; primary CTA pinned to the bottom action band with safe-area inset.
- **Key visual elements:** Each card is a 9:16 preview (`aspect-[9/16]`) on `--bg-surface` with `--border` hairline, frame artwork `object-contain`. Selected card: gold 2px border + `--accent-soft` fill + small gold check badge. Radio-group keyboard behavior (arrow keys, roving tabindex, `aria-checked`) is preserved from the current implementation.
- **Primary action placement:** Full-width gold confirm ("Use Wedding Floral" / "Continue without frame") at the bottom; "Skip — no frame" as a quiet text link below it.
- **Transition:** Confirm fades to a brief usage-confirmation state, then into the Camera screen (`--motion-base`).

### 5.3 Camera + Audio inline

- **Layout:** The viewfinder is the hero and fills the entire viewport (`100dvh`, minus safe areas). No page chrome — the event title and guest name sit in a compact translucent top bar (`--overlay` backdrop) that fades out after a few seconds of inactivity.
- **Viewfinder:** Full viewport, `object-cover`, `playsInline`, `muted`, `autoPlay`.
- **Frame overlay:** `absolute inset-0`, `object-contain`, `pointer-events-none`, never mirrored, never stretched — drawn above the live preview exactly as it will be composited (WYSIWYG, 1080×1920).
- **Counter:** Top overlay (below the title bar), right-aligned, DM Mono, "N / M" format (e.g. `3 / 5`), `--text-primary` on a subtle `--overlay` pill. Reflects the local capture-budget hint; server limits remain authoritative.
- **Shutter:** Bottom center, a 72px gold circle with a `--bg-base` ring, thumb-reachable, `env(safe-area-inset-bottom)` clearance. Press feedback: 150ms scale + flash overlay. Disabled state (limit reached) at reduced opacity with a text hint.
- **Audio trigger:** Bottom-right corner icon button (mic glyph, 44px+ hit area) with a visible label ("Voice note"). Opens the recorder panel; never blocks capture while closed.
- **Audio panel:** Slides up from the bottom, 350ms ease-out, `transform: translateY(100%) → 0`, covering the bottom ~60% of the screen with `--bg-elevated` and a `--overlay` scrim behind. Contains: header ("Voice note"), recording state (gold pulse-free "Recording" label + DM Mono elapsed timer + stop), review state (playback bar, duration, re-record / submit), and the skip link ("Lewati & kirim foto saja"). Panel dismisses by drag-down affordance or close button; no screen change ever occurs.
- **Pending strip:** Horizontal scroll row of ~48px thumbnails sitting above the shutter, showing per-item status (pending / uploading spinner / confirmed check / error / expired). Tap opens the existing full-size review overlay (delete / retake).
- **Photo review / sync:** The existing photo-review step (grid, per-item delete, sync-then-advance CTA) is retained as the state between camera and Done, restyled on dark tokens — sync entry point and behavior unchanged per UI_UX §4.4.
- **Transition:** After voice submit/skip (or photo-only advance), the screen crossfades to Done (`--motion-base`).

### 5.4 Done (Completion)

- **Layout:** Quiet, centered, full-screen `--bg-base`. One gold check mark (success glyph, not animated), event title in Cormorant Garamond 4xl, and two short lines of receipt copy ("Thank you — your photos and voice note have been added to {event}.").
- **Key visual elements:** Nothing else. No actions, no navigation, no submission affordances.
- **Primary action placement:** None — the session is closed from the guest perspective.
- **Transition:** None out. A new session requires Start again.

## 6. Admin Flow

Same dark tokens as guest (`--bg-base` page, `--bg-surface` cards, `--border` hairlines, gold reserved for the single primary action per view). Functional and data-dense: no Cormorant flourishes beyond page/event titles, no decorative imagery, no motion beyond the standard focus/hover tokens.

- **Sign-in:** Narrow centered `--bg-surface` card, labelled email/password fields, single gold sign-in button, status region below the form.
- **Event Index (`/admin`):** List of the admin's events as dense rows (title, status pill, created date in DM Mono); ACTIVE event visually prominent via gold left-edge marker; Open and Access/QR actions per row; create-new-event action.
- **Event dashboard:** Compact header (event title in Cormorant 3xl, status, close + access/QR actions), guest-name search above the newest-first timeline. At `lg`: 18rem context rail + timeline. Submission groups by guest session; photo tiles on `--bg-surface` with DM Mono timestamps; voice notes as bordered playback rows (play/pause, duration, progress, individual download). Skeletons, empty states, error surfaces restyled — behavior and states per UI_UX §5.2 unchanged.
- **Event creation / Access-QR:** Same field anatomy on `--bg-surface`; QR block bounded, copy/print actions, no signed URLs ever shown.

## 7. Component Inventory

| Component | Scope | Description | Status | Priority |
|---|---|---|---|---|
| GuestEventEntry (state machine) | Guest | Screen router + session/expiry/carry-over/sync logic; audio becomes inline panel state instead of a screen | REDESIGN | P1 |
| PreSession | Guest | Landing: event title, optional name, Start | REDESIGN | P1 |
| FrameSelection | Guest | 9:16 frame card grid, radio-group a11y, confirm/skip | REDESIGN | P1 |
| Capture | Guest | Fullscreen camera hero: overlay frame, N/M counter, 72px shutter, audio trigger + slide-up panel, pending strip | REDESIGN | P1 |
| AudioRecorderPanel (from VoiceAndMessage) | Guest | Voice recorder as bottom slide-up panel (350ms ease-out, bottom 60%); recording/review/submit/skip states | REDESIGN | P1 |
| PhotoReview | Guest | Photo grid, per-item delete/retry, sync-then-advance CTA | REDESIGN | P1 |
| Done | Guest | Completion screen: gold check, event title, receipt copy | REDESIGN | P1 |
| useCamera | Guest | getUserMedia lifecycle, 9:16 compositing, camera switch | KEEP | P1 |
| lib/frames.ts | Guest | Frame registry + loader | KEEP | P1 |
| lib/pending-photos.ts | Guest | Pending buffer states, sync predicates | KEEP | P1 |
| lib/usage.ts | Guest | Usage types/deltas | KEEP | P1 |
| frame-selector.tsx (legacy) | Guest | Superseded pre-sequential-flow selector; retire or fold into FrameSelection | KEEP | P2 |
| Shell / Status / Busy / AuthGate / Button / api (admin-ui.tsx) | Admin | Admin primitives — dark token restyle | REDESIGN | P3 |
| AdminSignIn | Admin | Credentials form on dark tokens | REDESIGN | P3 |
| AdminEventIndex | Admin | Event list, ACTIVE prominence, open/access actions | REDESIGN | P3 |
| AdminDashboard | Admin | Search, grouped timeline, photo/voice tiles, preview dialog | REDESIGN | P3 |
| AdminCreateEvent | Admin | Title field + create flow | REDESIGN | P3 |
| AdminAccess | Admin | URL + QR block, copy/print | REDESIGN | P3 |

All rows map to existing files under `components/`, `hooks/`, and `lib/`. No new component has been invented; the single rename (VoiceAndMessage → AudioRecorderPanel) reflects the slide-up-panel decision applied to the existing file.
