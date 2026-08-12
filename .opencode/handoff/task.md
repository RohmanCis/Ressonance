# Task — T021 QR Scannable Generator

## Goal
Replace the deterministic visual QR placeholder in the Admin access screen with a real scannable QR code, preserving all existing behavior.

## Governing documents (read before editing)
- `docs/UI_UX.md` §5.4 (Event access and QR): states = loading; ready; copy success; print in progress/unavailable; access not found/forbidden; network failure; retryable unexpected failure. Signed media URLs must never be shown.
- `docs/UI_DESIGN.md` L155: URL block + bounded QR block with copy and print actions. Loading reserved; copy success local feedback; print in progress/unavailable and access failure use status surfaces. Never show signed media URLs.
- `docs/PRD.md` §12: QR is an access mechanism pointing to the event public URL. Not a DB entity. Single QR per event.
- `docs/API_CONTRACT.md` 5.6: access endpoint returns `public_url` only.

## Approved dependency
- Install: `npm install qrcode.react@4.2.0`
- Justification: React 19 peer-compatible (`^19.0.0`); renders SVG (print-crisp, accessible, no canvas); within approved latitude (PRD L802 open, UI_UX L211 permits library). User-approved.

## Scope (exact)
File: `components/admin/admin-access.tsx` ONLY.

Replace ONLY the placeholder element:
```
<div aria-label="QR visual placeholder" className="mx-auto mt-5 grid aspect-square max-w-52 grid-cols-9 gap-1 rounded-md border-8 border-foreground bg-card p-2">
  {Array.from({ length: 81 }, (_, i) => <i key={i} className={(i * 17 + publicId.charCodeAt(i % publicId.length)) % 5 < 2 ? "bg-foreground" : "bg-transparent"} />)}
</div>
```

With a scannable QR using `QRCodeSVG` from `qrcode.react`, rendering the `url` value (the public URL already fetched by the component).

## Preserve exactly
- The outer `<section>` container: `rounded-[10px] border border-border bg-card p-6 text-center shadow-[var(--shadow-1)]` and `<h2 className="text-xl font-semibold">QR access</h2>`.
- Bounded QR block: aspect-square, max-w-52, centered, bordered treatment (preserve `border-8 border-foreground bg-card p-2 rounded-md` container or equivalent bounded block).
- URL source: the existing `url` state from `/api/admin/events/${publicId}/access`.
- Loading state: `!url` → `<Busy label="Loading access details" />`.
- Error state: existing `Status` + Retry.
- Copy action + `copied` feedback.
- Print action + `printing` state + `Print access card` button.
- Responsive layout: `lg:grid-cols-[1fr_18rem]` grid unchanged.
- Accessibility: QR must have an `aria-label` (e.g. `aria-label="QR code for event access"`). QRCodeSVG renders `<svg>`; ensure it has an accessible label.
- Print fidelity: SVG must print crisply (no canvas, no external image fetch).

## Do NOT
- Modify any canonical document.
- Touch any other file (no other admin/guest flow changes).
- Change the access URL, copy, print, or any state wording.
- Add multiple QR variants.
- Persist or show signed media URLs.

## Verify (run and report output)
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test` (vitest)

## Report in result.md
- Status, files changed, install output summary, verification output, blockers, SSOT conflict, architecture drift, next step.
- Confirm QR is scannable (standard QR encoding of the public URL).
