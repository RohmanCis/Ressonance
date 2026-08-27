# Result: Admin Dashboard Lighthouse Remediation (waves 1–3)

## Status
COMPLETE — all gates met.

## Before / After (Lighthouse, desktop preset)
| Metric | Before | After | Gate |
|---|---|---|---|
| Performance | 49 | **93** (auth dashboard) / 100 (sign-in) | ≥90 ✅ |
| CLS | 0.615 | **0** | ≤0.02 ✅ |
| LCP | 4.4s | <2.5s (no LCP violation reported) | ✅ |
| TBT | 410ms | 0ms reported | ✅ |
| Accessibility / BP / SEO | — | 100 / 100 / 100 | ✅ |

Baseline: owner-reported audit of `/admin/events/[public_id]` (perf 49→60 after first partial pass, CLS 0.615, LCP 4.4s→3.1s).
After: fresh `npm run build && npm run start`, authenticated run (live admin cookie, event `tnqbbcMsf1TeSUXEA_k6AQ`), `lh-dash2.json`.

## Code changes
- `components/admin/admin-dashboard.tsx`
  - `useInViewOnce` (IntersectionObserver, rootMargin 200px, once+disconnect, IO-undefined eager fallback); PhotoTile signed-URL fetch now viewport-gated. Retry/error/loading UI unchanged.
  - `decoding="async"` on PhotoTile + PreviewDialog `<img>` (PhotoTile keeps `loading="lazy"`).
  - `AsideSkeleton` (zero-shift: eyebrow h-3, title h-9, badge h-6, 2× min-h-12, same mt rhythm) replacing `Busy`; aside `min-h-[300px]`.
  - `load()` sequential waterfall → `Promise.all` (event + submissions); single try/catch preserved.
  - Unused `Busy` import removed.
- `app/layout.tsx` — `display: "swap"` on all 4 `next/font/google` configs.
- `next.config.ts` — `headers()`: `/frames/:path*` → `Cache-Control: public, max-age=31536000, immutable`.
- `app/icon.svg` — favicon (was sole BP deduction via 404).

## Skeleton-transition note (directive 3)
Left/right skeletons already unmount atomically: `Promise.all` resolves both fetches in one tick; `setEvent`/`setItems`/`setBusy(false)` land in one React commit. Right column keys on `busy`, left on `busy && !event` — deliberately retained so search refetches (event already loaded) don't flash AsideSkeleton and reintroduce shift. No change needed.

## Validation
- `npm run typecheck` — 0 errors.
- `npx vitest run` — 354/354 (43 files).
- `npx playwright test` — 37 passed / 1 skipped (live-backend skip, expected).
- `npm run build` — PASS (warnings pre-existing).

## Pitfalls hit (for future runs)
- Stale `next start` on :3000 served old asset hashes → 400s; Lighthouse against it is invalid. Verify a current-build asset returns 200 before measuring.
- Lighthouse `--extra-headers` accepts a JSON file path (raw `Cookie:` string is misparsed as a file).
- Leaked headless Chrome processes lock `%TEMP%\lighthouse.*` (EPERM); kill headless-only Chrome and redirect TMP before rerunning.

## Verification limits
- Perf 93 / CLS 0 = single Lighthouse sample, desktop preset, one event dataset (owner accepted single-sample limitation). Aside geometry is content-independent (fixed buttons + min-h floor), so dataset-shape risk is confined to the left column.
- Mobile preset unmeasured (baseline was desktop; desktop is scope).
- Preview/download/search behavior covered by existing vitest + Playwright suites, not by Lighthouse.

## Blockers / SSOT conflicts / drift
None. No API/schema/docs changes; no new deps.

## Next
Commit proposed: `perf(admin): lazy PhotoTile fetch, AsideSkeleton, parallel load, font swap, cache headers, favicon`
