# Task: UI/UX polish batch — 6 polish points + 2 minor

Two parallel lanes (design-1 @designer, fix-1 @fixer) + one queued lane (fix-2 @fixer, AFTER design-1 completes). Fixers/designer report in their final message; orchestrator writes result.md.

Global constraints: TypeScript strict, no `any`, no new deps, no canonical-doc changes, Bahasa Indonesia copy register (santai/ramah guest, kasual-profesional admin), no API contract changes. Do NOT run vitest (serialized/destructive — orchestrator runs it once at the end). Per-lane validation: `npm run typecheck` ONLY. Keep e2e selectors stable EXCEPT the two aria-labels explicitly listed below (spec updates are in scope).

Governing doc: `docs/DESIGN.md` (CANONICAL). Key sections: §2 tokens (+ Amber amendment), §3 type scale (3xl guest headings), §4 motion (transform+opacity only, reduced-motion), §5.3 Capture, §5.5 Voice, §5.1 PreSession, §5.7 admin.

## Lane design-1 — @designer: 6 polish points

### 1. Touch targets
- `components/guest/screens/Capture.tsx:272` "Lanjut →" CTA: `h-11` (44px) → 48px (`h-12`) — guest primary canon (§5.1/§5.3, 48px guest primaries). Adjust the placeholder spacer (`h-11 w-11` at line 277) to match new height so layout doesn't jump.
- `components/admin/admin-dashboard.tsx` media filter segmented control (around line 775, `role="group" aria-label="Saring jenis media"`): buttons/segments currently < 44px — raise to min-h-11 (44px).

### 2. Motion violations (§4: transitions animate transform + opacity ONLY)
Audit findings — fix each, preserving the visual intent (same feel, compliant properties):
- `Capture.tsx:200` `transition-[box-shadow,opacity]` on the 9:16 stage — remove box-shadow from the transition (keep opacity; if shadow change is desired make it instant).
- `Capture.tsx:151,235,258` bare `transition` (all properties) on buttons with `active:scale-*`/`hover:bg-*` — narrow to `transition-transform` (or `transition-[transform,opacity]`).
- Voice/Capture/PreSession: find remaining transitions/animations that animate bg/border/shadow/height and convert to transform/opacity or make the non-compliant property change instant. NOTE: `animate-pulse` on Voice recording affordances (mic halo, status dot, equalizer) and on loading skeletons is RATIFIED (§2 amendment, §4) — do not remove those.
- Respect existing `prefers-reduced-motion` handling; do not weaken it.

### 3. Color literals bypass tokens
- `Capture.tsx:261` shutter core gradient `from-amber-600 via-accent to-yellow-200` — rebuild using token-derived colors (`--accent` and existing token alpha variants; the shutter is a gold primary, amber is NOT allowed on primaries per §2 amendment). Keep the gold gradient look.
- `components/admin/admin-dashboard.tsx:673,685,708` destructive buttons: `border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/40` → `--error` token equivalents (`border-error/30 bg-error/10 text-error hover:bg-error/20 hover:border-error/40`).

### 4. Voice success color
- `components/guest/screens/VoiceRecordingScreen.tsx` success/confirmed state uses gold — per §2 `--success` (green) is the confirmed-persistence semantic. Change the success state color to `--success`; gold stays on primary actions only. (Amber recording-state styling stays.)

### 5. Guest heading mobile
- Guest screen heading rendered `text-2xl` on mobile where canon (§3) requires 3xl (2rem) for guest screen headings — locate in PreSession/Voice/PhotoReview and set `text-3xl` at mobile (verify against §5 per-screen specs).

### 6. EN aria-labels in admin-access
- `components/admin/admin-access.tsx:62` `aria-label="QR code for event access"` and `:93` `aria-label="Printable QR code for event access"` → Bahasa Indonesia (canon §5.7 supersedes the old EN aria-label convention). Suggested: "Kode QR akses acara" / "Kode QR cetak akses acara".
- MUST sync e2e specs that select these attributes: `e2e/qr-qa.spec.ts:26,69,85` and `e2e/print-qa.spec.ts:46,47` — update the selector strings to the new labels. No other e2e changes.

## Lane fix-1 — @fixer: signOut 500 branch test
- `app/api/admin/auth/sign-out/route.ts` checks `signOut()` result → 500 INTERNAL_ERROR + `logApiError("admin_sign_out_failed")` on failure. This branch has NO test.
- Add a focused co-located test (match existing sign-out route test conventions — see existing `*.test.ts` beside the route) covering the failure branch: mocked supabase `signOut` rejecting/returning error → expect 500 + INTERNAL_ERROR envelope. Also assert success + unauthenticated paths still pass if not already covered.
- Do not touch any file outside `app/api/admin/auth/sign-out/`.

## Lane fix-2 — @fixer (AFTER design-1 terminal): capture error feedback
- `components/guest-event-entry.tsx:268-284` `handleCapture`: `catch { return; }` + `if (!blob) return;` swallow capture failures — user gets no feedback (shutter flashes, no photo appears).
- Fix: on failure (throw OR null blob), surface a transient error in the Capture screen — e.g. state passed down / callback result, rendered as a `role="alert"` quiet bordered block matching §5.3 banner anatomy ("Gagal jepret foto, coba lagi." — keep register santai). Auto-dismiss after a few seconds or on next successful capture.
- `hooks/use-camera.ts` `capture()` currently returns null on internal catch — you may keep that contract and treat null as failure at the call site; no signature change required.
- CRITICAL: design-1 just edited `components/guest/screens/Capture.tsx` — preserve its exact styling/structure; add only the minimal error display consistent with the existing banner pattern in that file.
