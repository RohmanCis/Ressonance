# Task: Custom AudioPlayer component replacing native <audio controls> on Voice screen

## Context
- Read AGENTS.md, DESIGN.md (root) first. Verify remote: `git remote -v` → RohmanCis/Ressonance.
- Read `components/guest/screens/VoiceRecordingScreen.tsx` in full.

## Goal
The native `<audio controls>` element is unstyled, renders per-browser/OS as a white/gray bar — inconsistent with the dark analog-film design system. Extract into a styled custom AudioPlayer component.

## Requirements
- File: `components/guest/audio-player.tsx` (new)
- Props: `src: string`, `duration: number` (seconds)
- Dark themed container: `bg-bg-surface rounded-xl border border-border/60 px-4 py-3`
- Controls:
  - Play/pause toggle — lucide `Play`/`Pause` icons, `text-accent`
  - Seek bar — accent fill, `bg-border` track, `h-1 rounded-full`
  - Elapsed/total time — DM Mono (`font-mono text-xs text-text-muted` per DESIGN.md DM Mono usage)
- NO volume control, NO download menu
- Mobile touch-friendly seek: `input[type=range]` with accent styling (44px+ effective touch target — per DESIGN.md §2 accessibility)
- DESIGN.md §2 tokens throughout; no inline color literals bypassing tokens
- Accessibility: play/pause button aria-label, seek slider aria-label; `prefers-reduced-motion` respected if animated
- TypeScript strict, no `any`

## Integration
Import and use in `VoiceRecordingScreen.tsx`, replacing the native `<audio>` element. Preserve any existing playback behavior the screen relies on (autoplay/loop/etc. — adapt if needed).

## Scope
No other file changes. No npm installs.

## Verify
`npx tsc --noEmit` must pass.

## result.md
Report: file created, lines changed in VoiceRecordingScreen, tsc result.
