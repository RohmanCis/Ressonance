# Task

# TASK: Luxury Analog Aesthetic & UI Visual Enhancement

## 1. Context & Authority
- **Governing Docs**: DESIGN.md (CANONICAL), UX_FLOW.md, AGENTS.md.
- **Goal**: Implement the "Luxury Analog Keepsake Edition" UI/UX overhaul across the newly established 6-step sequential guest flow.
- **Visual Identity**: Deep Espresso base, Pinyon Script handwriting accents, Gold Foil gradients, analog cassette micro-animations, and wax seal stamps.

## 2. Scope of Work & Phases

### Phase 1: Foundation, Tokens & Typography
**Target Files**: `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts` (or equivalent CSS config).
- **Fonts**: Add Google Font `Pinyon Script` (cursive) to the existing font trio.
- **Color Variables**: Overwrite root tokens with the Deep Espresso palette:
  - `--bg-base`: `#161311`
  - `--bg-surface`: `#1f1a17`
  - `--bg-elevated`: `#28221e`
  - `--text-primary`: `#f7f2ea`
- **Utilities**: Implement `.bg-espresso-mesh` (radial gradient + SVG noise), `.gold-foil-btn`, `.gold-foil-text`, and `.vignette-overlay`.
- **Animations**: Add keyframes for `spin-tape`, `stamp-drop`, `wave-pulse`, and `polaroid-develop`.

### Phase 2: Core Screens Polish (Landing to Review)
**Target Files**: `components/guest/screens/PreSession.tsx`, `FrameSelection.tsx`, `Capture.tsx`, `PhotoReview.tsx`.
- **PreSession**: Inject `Pinyon Script` greeting above the event title. Apply `gold-foil-btn` to the Start CTA.
- **FrameSelection**: Style the 9:16 frame cards with subtle hover lift and gold accents.
- **Capture**: Add the `.animate-develop` fade to the pending thumbnail strip. Apply glow/shadow to the 72px gold shutter.
- **PhotoReview**: Apply `.animate-develop` to the review grid to simulate polaroid processing.

### Phase 3: Analog Audio & Digital Keepsake (Voice to Done)
**Target Files**: `components/guest/screens/VoiceRecordingScreen.tsx`, `Done.tsx`.
- **VoiceRecordingScreen**: Build the vintage cassette tape UI. Implement `.animate-spin-tape` on the spools and `.wave-pulse` on the audio bars strictly during the `recording` state.
- **Done**: 
  - Add the `A & J SEALED` animated wax seal stamp (`.animate-stamp`).
  - Implement the "Digital Keepsake" card with a "Simpan ke Galeri Saya" secondary button (functionality: triggers local download of the composited 1080x1920 image from the client's memory).

## 3. Constraints & Validation
- **No Backend Drift**: Do not alter API payload structures, database schema, or Supabase storage logic.
- **Testing**: Maintain 100% pass rate for Vitest, Playwright E2E, and Typecheck.
- **Accessibility**: Ensure all new gold foil buttons and interactive elements maintain visible focus rings and WCAG AA contrast.
