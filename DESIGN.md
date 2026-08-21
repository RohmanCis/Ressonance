# DESIGN.md — Dark Analog-Film Redesign Proposal

**Status:** CANONICAL — approved 2026-08-20. Single source of truth for all UI/design decisions. This document supersedes the former light "memory-table" system (docs/UI_DESIGN.md and docs/UI_UX.md, now deleted). No backend, API, schema, or flow-authority change is involved.

Owner design decisions (2026-08-20, locked; token + copy update 2026-08-21, owner-ratified): frame picker as a separate screen before camera; a completion/Done screen after all submissions; admin full redesign on the same dark tokens; branding by event name only (no logo); Cormorant Garamond headings, DM Sans body, DM Mono for counters/timers; Deep Espresso palette — `#14110f` background, warm off-white `#f7f2ea` text, warm gold `#d4af37` as the only accent; camera fullscreen as hero; voice note as a dedicated full-screen step in the sequential flow (§5.5, no slide-up panel); mobile-first; CSS transitions only (transform + opacity); `prefers-reduced-motion` respected on all animations; guest-facing copy language is Bahasa Indonesia (santai dan ramah).

---

## 1. Design Philosophy

The experience should feel like handling a roll of film at a wedding table at night: one warm lamp, deep shadow, and the photograph as the only bright thing in the room. Interfaces stay nearly invisible — matte black surfaces, quiet off-white type, and a single warm gold accent reserved for the moments that matter: the shutter, the confirm, the completed send. Cormorant Garamond gives event titles the engraved-invitation softness of a printed keepsake, while DM Mono counters tick like a film camera's frame counter. Every transition is a physical gesture — a panel slides, a thumbnail settles — nothing decorative, nothing that delays understanding.

## 2. Color Tokens

```css
:root {
  --bg-base: #14110f;        /* page background — deep espresso, warm near-black */
  --bg-surface: #1c1815;     /* cards, panels, review tiles */
  --bg-elevated: #28221e;    /* dialogs, popovers, elevated widgets */
  --text-primary: #f7f2ea;   /* warm off-white ink */
  --text-secondary: #d4cec3; /* supporting copy, labels */
  --text-muted: #9a8f82;     /* hints, timestamps, placeholders */
  --accent: #d4af37;         /* warm gold — actions, active states ONLY */
  --accent-soft: rgba(212, 175, 55, 0.14); /* selected-frame glow, active fills */
  --error: #c0564f;          /* destructive / upload failure */
  --success: #7da37a;        /* confirmed persistence */
  --border: rgba(240, 235, 224, 0.12); /* hairline dividers, field edges */
  --overlay: rgba(0, 0, 0, 0.6);        /* scrims behind panels and previews */
}
```

Rules: gold is the only accent and appears only on primary actions, focus rings, and confirmed/active states. Errors and successes never use gold. Text on `--accent` fills is `#14110f`. All contrast pairs (primary text on base, secondary on surface, accent on base) target WCAG AA.

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
  --motion-slow: 350ms; /* guest screen transitions */
}
```

Easing: `ease-out` for entering (panels rising, thumbnails fading in), `ease-in` for exiting. Only `transform` and `opacity` animate — never layout properties.

**What animates:**
- Guest screen transitions: sequential-flow states fade/slide (`--motion-slow`, 350ms) ease-out; only `transform` and `opacity`.
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
- **Key visual elements:** Eyebrow line ("Kamu diundang" — Pinyon Script script-face eyebrow, `--accent`); event title; one-sentence helper on the optional name; name field with `--border` underline styling on `--bg-surface`; expiry/carry-over and error messages as quiet bordered blocks. Guest copy in Bahasa Indonesia, tone santai dan ramah.
- **Primary action placement:** Start button ("Mulai Pengalaman") full-width at the bottom of the card, 48px high, gold fill (`--accent`) with `#14110f` text. Single obvious action.
- **Transition:** On successful Start, screen fades/slides out (opacity + slight translateY, `--motion-base`) into Frame Selection.

### 5.2 Frame Selection

- **Layout:** Full-screen `--bg-base`, viewport-locked (`h-dvh overflow-hidden`, no page scroll): header (shrink-0) + horizontal snap carousel (`flex-1 min-h-0`) + pinned bottom action band with safe-area inset. Heading (Cormorant 3xl, "Pilih Bingkai Foto") + one helper line at top.
- **Key visual elements:** Each card is a 9:16 preview (`aspect-[9/16]`) on `--bg-surface` with `--border` hairline, frame artwork `object-contain`. Selected card: gold 2px border + `--accent-soft` fill + small gold check badge. Radio-group keyboard behavior (arrow keys, roving tabindex, `aria-checked`) is preserved from the current implementation.
- **Primary action placement:** Full-width gold confirm ("Gunakan Bingkai {Frame}" / "Lanjut Tanpa Bingkai") at the bottom; "Lewati — Tanpa Bingkai" as a quiet text link below it.
- **Canonical frame registry (Dynamic Frame Engine, owner-approved 2026-08-21):** exactly three luxury wedding templates, plus "No Frame" (`none`, default):
  1. `royal-gold` — "Royal Gold Serif": classic double-hairline border + quarter-arc corner flourishes + center diamonds; event title in Cormorant Garamond italic 96px `--accent` (gold).
  2. `botanical-romance` — "Botanical Romance": organic wavy rails + corner botanical leaf clusters + berry accents; event title in Pinyon Script 124px `--text-primary` (ivory).
  3. `modern-editorial` — "Modern Editorial": paired editorial rules + crop-mark ticks + monogram square + corner brackets; event title in DM Mono 58px `--text-primary`, uppercase, 16px letter tracking.
- **Dynamic composition model (`FrameTextLayer`):** frame assets are 1080×1920 PNG overlays with true alpha and a transparent photo area — never any baked text. The event title (bride & groom names, e.g. "Rijal & Cindi") interpolates at shutter time: each template declares text layers (font role, size, weight, letter tracking, color, vertical anchor `yRatio` in the 0.845–0.875 band of the 1920px output) rendered onto the canvas after the photo and overlay, centered horizontally. Canvas fonts resolve from the next/font variables (`--font-cormorant`, `--font-pinyon`, `--font-dm-mono`) and drawing is gated on `document.fonts.ready` so the baked JPEG never falls back to a system font. Output stays the fixed 1080×1920 JPEG (quality 0.92); overlay and text are never mirrored — only the photo mirrors for the front camera.
- **Transition:** Confirm fades to a brief usage-confirmation state, then into the Camera screen (`--motion-base`).

### 5.3 Camera (Capture)

- **Layout:** The viewfinder is the hero and fills the entire viewport (`100dvh`, minus safe areas). No page chrome — the event title and guest name sit in a compact translucent top bar (`--overlay` backdrop) that fades out after a few seconds of inactivity.
- **Viewfinder:** Full viewport, `object-cover`, `playsInline`, `muted`, `autoPlay`.
- **Frame overlay:** `absolute inset-0`, `object-contain`, `pointer-events-none`, never mirrored, never stretched — drawn above the live preview exactly as it will be composited (WYSIWYG, 1080×1920).
- **Counter:** Top overlay (below the title bar), right-aligned, DM Mono, "N / M" format (e.g. `3 / 5`), `--text-primary` on a subtle `--overlay` pill. Reflects the local capture-budget hint; server limits remain authoritative.
- **Shutter:** Bottom center, a 72px gold circle with a `--bg-base` ring, thumb-reachable, `env(safe-area-inset-bottom)` clearance. Press feedback: 150ms scale + flash overlay. Disabled state (limit reached) at reduced opacity with a text hint.
- **Pending strip:** Horizontal scroll row of ~48px thumbnails sitting above the shutter, showing per-item status (pending / uploading spinner / confirmed check / error / expired). Tap opens the existing full-size review overlay (delete / retake).
- **Transition:** Manual "Lanjut" CTA or auto-advance at budget zero transitions to Photo Review (`--motion-base`).

### 5.4 Photo Review

- **Layout:** Full-screen `--bg-base`. Grid of captured photos with per-item delete and sync status.
- **Key visual elements:** Photo tiles on `--bg-surface` with DM Mono timestamps; per-item status indicators (pending / uploading spinner / confirmed check / error).
- **Primary action placement:** Full-width gold sync-then-advance CTA ("Kirim & Lanjut") at bottom; advance is blocked while items are pending/uploading.
- **Transition:** After successful batch sync, advance to Voice Note screen (`--motion-base`).

### 5.5 Voice Note (Full-Screen Recording)

- **Layout:** Full-screen `--bg-base`, safe-area padded. Event title eyebrow (text-xs muted) + Cormorant Garamond 3xl/4xl heading ("Tinggalkan Pesan Suara").
- **Center Stage:** Gold mic button (h-20 w-20), DM Mono timer (00:00 / 00:30), pulse-free recording status label.
- **Recording state:** "Recording" label + elapsed timer + square stop button.
- **Review state:** Audio player preview (playback bar, duration), duration check (<5s warning text), "Rekam Ulang" secondary action, primary gold CTA "Kirim Pesan Suara".
- **Skip action:** "Lewati — Kirim Foto Saja" text link below primary CTA; advances to Done without voice upload.
- **Transition:** Submit or skip advances to Done (`--motion-base`).

### 5.6 Done (Completion)

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
| GuestEventEntry (state machine) | Guest | Screen router + session/expiry/carry-over/sync logic; 6-step sequential flow with voice-note as dedicated screen | REDESIGN | P1 |
| PreSession | Guest | Landing: event title, optional name, Start | REDESIGN | P1 |
| FrameSelection | Guest | 9:16 frame card grid, radio-group a11y, confirm/skip | REDESIGN | P1 |
| Capture | Guest | Fullscreen camera hero: overlay frame, N/M counter, 72px shutter, pending strip, Lanjut CTA | REDESIGN | P1 |
| PhotoReview | Guest | Photo grid, per-item delete/retry, sync-then-advance CTA to voice-note screen | REDESIGN | P1 |
| VoiceRecordingScreen (refactored from VoiceAndMessage) | Guest | Full-screen voice recording: gold mic, DM Mono timer, recording/review/submit/skip states | REDESIGN | P1 |
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

All rows map to existing files under `components/`, `hooks/`, and `lib/`. No new component has been invented; the single rename (VoiceAndMessage → VoiceRecordingScreen) reflects the dedicated full-screen voice step (§5.5) applied to the existing file.
