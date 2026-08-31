# DESIGN.md — Dark Analog-Film Redesign Proposal

**Status:** CANONICAL — approved 2026-08-20. Single source of truth for all UI/design decisions. This document supersedes the former light "memory-table" system. No backend, API, schema, or flow-authority change is involved.

Owner design decisions (2026-08-20, locked; token + copy update 2026-08-21, owner-ratified; camera-capture update 2026-08-21, owner-ratified: §5.3 camera now a 3-zone photobooth studio — minimal top bar, isolated 9:16 viewport, bottom control dock — superseding "camera fullscreen as hero"): frame picker as a separate screen before camera; a completion/Done screen after all submissions; admin full redesign on the same dark tokens; branding by event name only (no logo); Cormorant Garamond headings, DM Sans body, DM Mono for counters/timers; Deep Espresso palette — `#14110f` background, warm off-white `#f7f2ea` text, warm gold `#d4af37` as the only accent; camera fullscreen as hero (superseded 2026-08-21, see §5.3); voice note as a dedicated full-screen step in the sequential flow (§5.5, no slide-up panel); mobile-first; CSS transitions only (transform + opacity); `prefers-reduced-motion` respected on all animations; guest-facing copy language is Bahasa Indonesia (santai dan ramah).

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
  --accent-foil-light: #f0d97a; /* gold-foil button gradient highlight */
  --accent-foil-dark: #b8912a;  /* gold-foil button gradient deep shade */
  --accent-soft: rgba(212, 175, 55, 0.14); /* selected-frame glow, active fills */
  --error: #c0564f;          /* destructive / upload failure */
  --success: #7da37a;        /* confirmed persistence */
  --border: rgba(247, 242, 234, 0.12); /* hairline dividers, field edges */
  --overlay: rgba(0, 0, 0, 0.6);        /* scrims behind panels and previews */
}
```

Rules: gold is the only accent and appears only on primary actions, focus rings, and confirmed/active states. Errors and successes never use gold. Text on `--accent` fills is `#14110f`. All contrast pairs (primary text on base, secondary on surface, accent on base) target WCAG AA.

Ambient gold (bg-accent/10–20, blur-based orbs, hairline accent/20 borders) is ratified as system mood — permitted in background layers and decorative surfaces where it does not compete with interactive elements.

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

Admin controls menggunakan text-sm sebagai ukuran button (bukan base) — diratifikasi 2026-08-30.

## 4. Motion Principles

```css
:root {
  --motion-fast: 150ms; /* presses, hovers, focus */
  --motion-base: 250ms; /* panel settle, thumbnail appear */
  --motion-slow: 350ms; /* guest screen transitions */
  --motion-develop: 800ms; /* photo develop effect (Capture, PhotoReview animate-develop) */
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
- **Key visual elements:** Eyebrow line ("Ada cerita buat kamu" — Pinyon Script script-face eyebrow, `--accent`); event title; one-sentence helper on the optional name ("Jepret momennya, pilih Frame favorit, lalu tinggalin pesan."); name field ("Namamu", quiet "Boleh dikosongkan" pill, placeholder "Contoh: Andi") with `--border` underline styling on `--bg-surface`; expiry/carry-over and error messages as quiet bordered blocks (`--border` on `--bg-elevated`, color on text only; error text in `--error`). Guest copy in Bahasa Indonesia, tone santai dan ramah.
- **Primary action placement:** Start button ("Mulai yuk"; starting state "Sebentar ya…"; carry-over "Mulai & Bawa Foto Draf") full-width at the bottom of the card, 48px high, gold fill (`--accent`) with `#14110f` text. Single obvious action, followed by a quiet clock-icon reminder line ("30 menit untuk abadikan momenmu.").
- **Transition:** On successful Start, screen fades/slides out (opacity + slight translateY, `--motion-base`) into Frame Selection.

### 5.2 Frame Selection

- **Layout:** Full-screen `--bg-base`, viewport-locked (`h-dvh overflow-hidden`, no page scroll): header (shrink-0) + horizontal snap carousel (`flex-1 min-h-0`) + pinned bottom action band with safe-area inset. Heading (Cormorant 3xl, "Pilih Frame fotomu") + one helper line at top.
- **Key visual elements:** Each card is a 9:16 preview (`aspect-[9/16]`) on `--bg-surface` with `--border` hairline, frame artwork `object-contain`. Selected card: gold 2px border + `--accent-soft` fill + small gold check badge. Radio-group keyboard behavior (arrow keys, roving tabindex, `aria-checked`) is preserved from the current implementation.
- **Primary action placement:** Full-width gold confirm ("Pakai {Frame}" with camera icon / disabled fallback "Pilih Frame") at the bottom; "Tanpa Frame, lanjut" as a quiet text link below it. Selection-indicator dots render above the band when more than one option exists; a quiet "30 menit untuk abadikan momenmu." reminder line sits under the actions.
- **Canonical frame registry (Dynamic Frame Engine, owner-approved 2026-08-21; fifth template added 2026-08-28, owner-approved):** five wedding templates, plus "No Frame" (`none`, default):
   1. `royal-gold` — "Royal Gold Serif": classic double-hairline border + quarter-arc corner flourishes + center diamonds.
   2. `botanical-romance` — "Botanical Romance": organic wavy rails + corner botanical leaf clusters + berry accents.
   3. `modern-editorial` — "Modern Editorial": paired editorial rules + crop-mark ticks + monogram square + corner brackets.
   4. `wedding-crimson` — "Wedding Crimson": typography ("The Wedding of", couple names, date) baked into the 1080×1920 asset; like every frame it registers no dynamic text layers — no title stamp on captured photos (owner decision 2026-08-29).
   5. `flower` — "Flower": floral border artwork with a transparent center band.
- **Dynamic composition model (`FrameTextLayer`):** frame assets are 1080×1920 PNG overlays with true alpha and a transparent photo area — never any baked text (sole exception: `wedding-crimson`, whose typography is baked in). No frame registers a dynamic event-title layer: the title stamp was removed from captured photos entirely (owner decision 2026-08-29) and frames carry their decorative artwork only. Output stays the fixed 1080×1920 JPEG (quality 0.92); the overlay is never mirrored — only the photo mirrors for the front camera.
- **Transition:** Confirm fades to a brief usage-confirmation state, then into the Camera screen (`--motion-base`).

### 5.3 Camera (Capture) — 3-Zone Photobooth Studio

- **Layout (owner-ratified 2026-08-21):** Dedicated 3-zone column (`h-dvh`, no floating HUD bands over the art): Top Minimal Bar (shrink-0) + Isolated 9:16 Frame Viewport (flex-1) + Dedicated Bottom Control Dock (shrink-0). This replaces the former full-bleed overlay HUD, whose floating bands obscured ornamental frame art (e.g. `wedding-crimson`'s baked typography).
- **Top Zone:** Compact glass pills only — camera switch (left, `aria-label="Ganti kamera"`, rendered only with ≥2 cameras) and the DM Mono counter (right, "N / M" format, e.g. `3 / 5`, `--text-primary` on a subtle `--overlay` pill, `aria-live="polite"`). No event-title/guest banner on this screen. Closed-event and pre-expiry banners render in flow beneath the bar (`role="alert"` / `role="status"`). The counter reflects the local capture-budget hint; server limits remain authoritative.
- **Center Zone:** Bounded, centered 9:16 viewport box (`aspect-[9/16]`, `max-h-full`, rounded corners, hairline border on `--bg-surface`) that hosts the live preview, the frame overlay, and the shutter flash — frame art breathes with zero UI on top. Video is `object-cover` within the box; because the box is exactly 9:16, the visible center cover-crop is now mathematically identical to the compositor's 1080×1920 crop (the former full-bleed viewfinder cropped tighter on tall viewports — this fixes the non-WYSIWYG sensor crop). `playsInline`, `muted`, `autoPlay`.
- **Frame overlay:** `absolute inset-0` **within the viewport box**, `object-cover`, `pointer-events-none`, never mirrored, never stretched — drawn above the live preview exactly as it will be composited (WYSIWYG, 1080×1920).
- **Shutter:** In the bottom dock, centered, a 72px gold circle with a `--bg-base` ring, thumb-reachable, `env(safe-area-inset-bottom)` clearance. Press feedback: 150ms scale + flash overlay scoped to the viewport box. Disabled state (limit reached) at reduced opacity with a text hint.
- **Bottom Dock:** Dedicated thumb-zone in document flow (never overlaying the art): pending photo strip (horizontal scroll, ~48px thumbnails, per-item status pending / uploading spinner / confirmed check / error / expired; tap opens the existing full-size review overlay with delete / retake), compact icon-styled file picker (accessible name "Pilih foto", `sr-only` input `accept="image/*"`), gold shutter, and the advance button "Lanjut →" (or "Lanjut" CTA equivalent when budget-0 auto-advance applies).
- **Transition:** Manual "Lanjut" CTA or auto-advance at budget zero transitions to Photo Review (`--motion-base`).

### 5.4 Photo Review

- **Layout:** Full-screen `--bg-base`. Grid of captured photos with per-item delete and sync status.
- **Key visual elements:** Photo tiles on `--bg-surface` with DM Mono timestamps; per-item status indicators (pending / uploading spinner / confirmed check / error).
- **Primary action placement:** Full-width gold sync-then-advance CTA ("Kirim & Lanjut") at bottom; advance is blocked while items are pending/uploading.
- **Transition:** After successful batch sync, advance to Voice Note screen (`--motion-base`).

### 5.5 Voice Note (Full-Screen Recording)

- **Layout:** Full-screen `--bg-base`, safe-area padded. Event title eyebrow (text-xs muted) + Cormorant Garamond 3xl/4xl heading ("Tinggalkan Pesan Suara").
- **Center Stage:** Gold mic button (h-20 w-20), DM Mono timer (00:00 / 00:30), pulse-free recording status label.
- **Recording state:** "Merekam" label + elapsed timer + square stop button (`aria-label="Stop rekaman"`).
- **Review state:** Audio player preview (playback bar, duration), duration check (<5s warning text), "Rekam Ulang" secondary action, primary gold CTA "Kirim Pesan Suara".
- **Skip action:** "Lewati — Kirim Foto Saja" text link below primary CTA; advances to Done without voice upload.
- **Transition:** Submit or skip advances to Done (`--motion-base`).

### 5.6 Done (Completion)

- **Layout:** Centered, full-screen `--bg-base` (`min-h-dvh`, `overflow-hidden`, safe-area padded top/bottom, `px-5 sm:px-8`, `text-center`, flex column centered). Disposable-camera thermal-print sequence (T035–T040, owner-ratified 2026-08-29) — six phase states (0–5) driven by `setTimeout` on mount, content gated by `phase >=` thresholds. Ambient ornaments render behind the `z-10` content stack.
  - **Phase 0 (mount → 1000ms):** Empty.
  - **Phase 1 (1000ms):** DM Mono loading line fades up — "Sebentar ya, foto kamu lagi diproses" with three staggered dots (1.2s `ease-in-out` infinite, 0/150/300ms delays). `text-sm text-text-muted`.
  - **Phase 2 (2500ms):** Camera illustration drops in — `camera-drop` 0.6s `ease-out` (`translateY(-40px) → 0`, `opacity 0 → 1`, transform+opacity only).
  - **Phase 3 (3200ms):** Thermal-print reveal begins. Condition A (`photoUrl` present): the 9:16 keepsake photo reveals downward from the film slot via `clip-path: inset(0 0 100% 0) → inset(0 0 0% 0)` over 5s linear (`thermal-print`). Condition B (voice-only, no photo): a 140×60px voice chip reveals over 2s linear (`thermal-print-fast`) — `bg-bg-surface`, `border-border/40`, gold `Mic` icon (`h-8 w-8 text-accent`) + "Pesan suara tersimpan" (`font-mono text-xs text-text-muted`). The print slot box reserves full height from phase 3 so layout never jumps.
  - **Phase 4 (8500ms):** Print complete → settle. The camera+photo assembly rises 24px (`slide-up-settle` 0.6s `ease-out`, `translateY`) and the photo rotates to `rotate(-1.5deg)` (`thermal-settle` 0.3s `ease-out`). Thank-you block fades up (`fade-up` 0.5s `ease-out`, `translateY(12px)→0`). Warm film light leaks fade in (see Key visual elements).
  - **Phase 5 (9000ms):** Keepsake download card fades up (`fade-up` 0.5s `ease-out`).
  - **Condition C** (`!hasKeepsakeEject` — no photo and no voice): camera and print skipped; phase jumps 0 → 4 at 500ms → 5 at 1000ms.
  - **`prefers-reduced-motion`:** phase set to 5 immediately on mount (all content visible at once); every Done-screen animation utility is neutralized — `opacity:1`, `transform:none` (camera-drop/thermal-print/thermal-settle/fade-up), `slide-up-settle` holds the settled `translateY(-24px)`, leaks hold a static `opacity:0.6`, ambient orbs fully still. This specific reduced-motion block applies in addition to the global §4 rule.
- **Key visual elements:**
  - **Disposable-camera SVG** — `viewBox="0 0 180 110"`, `w-full h-auto`, rendered at 200px width. Token-colored where structural, `aria-hidden`. Comprises: body rect (`--bg-elevated` + `--border`), dark top strip, gold flash bar (`--accent` opacity 0.8), shutter button, viewfinder, three-ring lens (concentric circles, `--accent` strokes at 0.3/0.15/0.2 opacity, inner `--bg-surface`), lens reflection, two film knobs, and a full-width film slot (160×4 rect, `--bg-base`) at the bottom edge from which the keepsake ejects.
  - **Keepsake photo (Condition A)** — 200px wide, `aspect-[9/16]`, `object-cover`, `alt="Foto kenangan"`. Container `w-[200px]`, `mt-[-2px]` (overlaps slot bottom by 2px), `overflow-hidden rounded-b-xl`. The `clip-path` reveal is unaffected by the parent's `overflow-hidden` (which only rounds bottom corners).
  - **Ambient ornaments (owner-ratified), `aria-hidden`, `pointer-events-none`:** three bokeh orbs — top-right (`h-72 w-72`, `bg-accent/15`, `blur-[90px]`, `animate-ambient-1` 12s `ease-in-out` infinite), bottom-left (`h-80 w-80`, `bg-accent/10`, `blur-[100px]`, `animate-ambient-2` 15s), right-mid (`h-48 w-48`, `bg-accent/8`, `blur-[80px]`, static) — plus a full-viewport `film-grain` overlay (SVG fractal-noise, opacity 0.06).
  - **Film light leaks (phase ≥ 4, owner-ratified analog palette):** left leak (`top-[15%]`, `h-[40%] w-[30%]`, `rounded-r-full`, gradient `from-[#8B1A1A]/20 via-[#C85A00]/10 to-transparent`, `blur-[40px]`, `animate-leak-left` 1.2s `ease-out`) and right leak (`top-[30%]`, `h-[30%] w-[25%]`, `rounded-l-full`, gradient `from-[#6B0F0F]/15 via-[#A04000]/8 to-transparent`, `blur-[35px]`, `animate-leak-right` 1.5s `ease-out`). These gradients are the only non-token color literals outside the camera SVG illustration, scoped to decorative `aria-hidden` layers.
  - **Thank-you block (phase ≥ 4):** Event title is `sr-only` — not visually shown. It renders as an `<h1>` (`font-display text-4xl font-semibold leading-tight tracking-tight`, `tabIndex={-1}`, focus moved to it on arrival) for heading semantics only. Two receipt lines below: "Terima kasih — foto dan pesan suara kamu sudah kami terima." (`text-sm text-text-secondary`, `max-w-sm`) and "Host akan melihatnya setelah acara." (`text-sm text-text-muted`, `max-w-sm`). No gold check glyph, no visible Cormorant event title.
  - **No actions, no navigation, no submission affordances** except the optional keepsake card below.
- **Primary action placement:** None for the session. Sole optional action — the **Digital Keepsake card** (phase ≥ 5, Condition A only — requires both `photoUrl` and `keepsakeUrl`): `mt-8`, `max-w-sm`, `rounded-2xl`, `border-border`, `bg-bg-surface/70`, `p-3`, `backdrop-blur-sm`, `animate-fade-up`. De-chromed: a single secondary-styled button `min-h-12 w-full rounded-lg border-border px-4 font-semibold text-text-primary` with `focus-visible:outline-2 outline-offset-2 outline-accent`, label "Simpan ke Galeri Saya", triggering a client-side anchor download (filename `keepsake-{slugified-eventTitle}-{timestamp}.jpg`). Helper line below: "Unduh foto kenangan berbingkai dari acara ini." (`text-xs text-text-muted`). No gold fill, no gold text — consistent with §2 (gold reserved for primary actions/focus/active; this is a quiet secondary). Voice-only and Condition-C sessions render no keepsake card.
- **Transition:** None out. A new session requires Start again. This is the terminal screen of the guest flow.

## 6. Admin Flow

Same dark tokens as guest (`--bg-base` page, `--bg-surface` cards, `--border` hairlines, gold reserved for the single primary action per view). Functional and data-dense: no Cormorant flourishes beyond page/event titles, no decorative imagery, no motion beyond the standard focus/hover tokens. All user-facing admin copy is Bahasa Indonesia, casual-but-professional register (owner-approved 2026-08-29; supersedes the 2026-08-22 English "Active"/"Closed" label decision and the earlier English aria-label convention). (Amended 2026-08-30: admin UX improvements batch)

- **Shell header (admin app frame):** Persistent top-right "Keluar" (logout) link, aligned with the view eyebrow, quiet muted styling (`--text-muted`), NOT gold — logout is not a primary action per §2. Triggers `POST /api/admin/auth/sign-out` (API Contract §5.11).
- **Sign-in (redesigned T044, owner-approved direction):** Asymmetric editorial split on desktop (`lg:grid-cols-[1.1fr_1fr]`, form column `lg:mt-16` offset), single stacked column on mobile. Left column: eyebrow "Akses admin", Cormorant h1 "Kelola acaramu." (3xl per §3 admin scale), left-aligned gold hairline + diamond divider (§5.1 echo), intro "Buat acara, bagikan akses, dan lihat semua kiriman." — over decorative rotated-diamond outlines (CSS borders, aria-hidden, lg-only). Right column: form card rhyming PreSession (`border-accent/20 bg-bg-surface/85 backdrop-blur-xl`, deep shadow, editorial corner crop-marks), labelled "Email"/"Kata sandi" underline fields, single gold "Masuk" button ("Sebentar, ya…" busy), status region below the form (`role="alert"` preserved).
- **Event Index (`/admin`) — Command Desk (owner-authored spec 2026-08-24; copy ID 2026-08-29):** ACTIVE event renders as a featured hero command card — decorative ambient gold glow (`bg-accent/10 blur-3xl`, aria-hidden), `border-l-accent` gold left edge, live badge (gold dot, `motion-safe:animate-pulse`, opacity-only) with visible text "Aktif", event title in Cormorant (`font-display`), created timestamp ("Dibuka …", DM Mono `tabular-nums`), quick-action stack: secondary "Buka" + "Akses / QR" (ACTIVE only; "Buat acara baru" is the view's sole gold primary). Past events render as a clean archive stack of structured cards (`rounded-xl bg-bg-surface/60`) with dual timestamp range ("Dibuka … · Ditutup …", DM Mono xs muted, label "Selesai") and a quiet "Buka" action; no Access/QR on closed events. Empty state: "Belum ada acara. Buat acara buat mulai kumpulin foto dan pesan suara." Busy skeleton, retryable error Status ("Coba lagi"), no layout jump.
- **Event dashboard — Ambient Glass Studio (owner-authored spec 2026-08-24; copy ID 2026-08-29):** Compact header (event title in Cormorant 3xl, status pill "Aktif"/"Selesai", "Tutup acara" gold primary + "Akses / QR" secondary while ACTIVE). "Tutup acara" requires a confirmation dialog — title "Tutup acara ini?", body "Setelah ditutup, tamu tidak bisa lagi mengirim foto atau pesan suara. Tindakan ini tidak bisa dibatalkan.", buttons "Batal" (secondary) and "Ya, tutup sekarang" (destructive, red — not gold). Metrics strip above search: three derived stat cards (Tamu = distinct session refs, Foto, Pesan suara) — exactly 3 metrics, each with a small non-gold icon chip — computed client-side from `items` only, DM Mono `tabular-nums` values, xs muted labels, zero-state renders identically (no fetch, no layout shift). Search input ("Cari nama tamu") — inline, debounced, no separate "Cari" submit button — plus segmented media filter (Semua / Foto / Suara) — `aria-pressed` buttons, active segment `bg-bg-elevated` + `text-text-primary` (never gold), client-side filtering applied before guest-session grouping. Submission groups by guest session as ambient glass cards (`rounded-3xl bg-bg-surface/90 border-border backdrop-blur-sm`) with guest initials avatar badge (neutral `bg-bg-elevated`, never gold), guest name, session badge ("Sesi N"), DM Mono media count ("N item"), breakdown ("N foto · M pesan suara"); per-group download intentionally omitted (bulk download is a locked MVP non-goal). Photo tiles on `--bg-surface` with DM Mono timestamps, hover = subtle image-only scale (transform, motion-safe), lightbox preview + per-item "Unduh". Voice notes as elevated player tiles (`rounded-2xl bg-bg-surface/90`): "Putar" play/pause, DM Mono duration counter, gold `scaleX` progress bar over a static decorative waveform (aria-hidden); per-item "Unduh". Skeletons ("Memuat acara" / "Memuat kiriman…" sr-only), empty states, error surfaces restyled to card anatomy — behavior and states unchanged.
- **Event creation / Access-QR:** Same field anatomy on `--bg-surface`; creation copy: eyebrow "Acara baru", title "Buat acara baru.", intro "Cuma bisa ada satu acara aktif. Tutup aja kalau acaranya udah selesai.", field "Nama acara" (placeholder "Contoh: Resepsi R & C"), gold "Buat acara" ("Membuat…" busy). Access-QR card: eyebrow "Bagikan akses", title "Bagikan akses acara.", intro "Tamu bisa scan kartus ini atau buka link publiknya.", 160px QR block, mono underline public URL ("URL publik"), gold-foil "Salin link" + secondary "Cetak QR", copy feedback "Link udah tersalin."; QR block bounded, copy/print actions, no signed URLs ever shown.

## 7. Component Inventory

| Component | Scope | Description | Status | Priority |
|---|---|---|---|---|
| GuestEventEntry (state machine) | Guest | Screen router + session/expiry/carry-over/sync logic; 6-step sequential flow with voice-note as dedicated screen | REDESIGN | P1 |
| PreSession | Guest | Landing: event title, optional name, Start | REDESIGN | P1 |
| FrameSelection | Guest | 9:16 frame card grid, radio-group a11y, confirm/skip | REDESIGN | P1 |
| Capture | Guest | 3-zone photobooth studio: minimal top bar (switch + N/M counter), isolated 9:16 viewport (frame art unobstructed), bottom dock (pending strip, icon file picker, 72px shutter, Lanjut CTA) | REDESIGN | P1 |
| PhotoReview | Guest | Photo grid, per-item delete/retry, sync-then-advance CTA to voice-note screen | REDESIGN | P1 |
| VoiceRecordingScreen (refactored from VoiceAndMessage) | Guest | Full-screen voice recording: gold mic, DM Mono timer, recording/review/submit/skip states | REDESIGN | P1 |
| Done | Guest | Completion screen: thermal-print sequence, sr-only title, receipt copy, optional keepsake card | REDESIGN | P1 |
| useCamera | Guest | getUserMedia lifecycle, 9:16 compositing, camera switch | KEEP | P1 |
| lib/frames.ts | Guest | Frame registry + loader | KEEP | P1 |
| lib/pending-photos.ts | Guest | Pending buffer states, sync predicates | KEEP | P1 |
| lib/usage.ts | Guest | Usage types/deltas | KEEP | P1 |
| Shell / Status / Busy / AuthGate / Button / api (admin-ui.tsx) | Admin | Admin primitives — dark token restyle | REDESIGN | P3 |
| AdminSignIn | Admin | Credentials form on dark tokens | REDESIGN | P3 |
| AdminEventIndex | Admin | Event list, ACTIVE prominence, open/access actions | REDESIGN | P3 |
| AdminDashboard | Admin | Search, grouped timeline, photo/voice tiles, preview dialog | REDESIGN | P3 |
| AdminCreateEvent | Admin | Title field + create flow | REDESIGN | P3 |
| AdminAccess | Admin | URL + QR block, copy/print | REDESIGN | P3 |

All rows map to existing files under `components/`, `hooks/`, and `lib/`. No new component has been invented; the single rename (VoiceAndMessage → VoiceRecordingScreen) reflects the dedicated full-screen voice step (§5.5) applied to the existing file.
