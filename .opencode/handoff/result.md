# Result: Phase A1 — Correctness & Contract Closure (2026-08-22)

**Status: COMPLETE.** All delegated lanes terminal; all validation green; repo
is ready for UI freeze pending the two owner decisions below.

## Scope items — PASS / FAIL / SKIPPED

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | P0 config readiness | **PASS** (repo) / **OWNER ACTION** | `TRUSTED_PROXY === "1"` wired at `app/api/events/[public_id]/session/route.ts:38` + `lib/guest-submission-pipeline.ts:100`; CRON_SECRET fail-closed in `app/api/cron/media-cleanup/route.ts:23`; `.env.example` + `vercel.json` consistent. Owner must set both in Vercel dashboard. |
| 2 | Object-URL cleanup stale closure | **PASS — FIXED** | `components/guest-event-entry.tsx`: added `expiredPendingRef`/`voiceUrlRef`; unmount cleanup reads refs. Lane: fix-1. |
| 3 | Retention tests for `runMediaCleanup()` | **SKIPPED — already satisfied** | Prior review finding was stale: `lib/media-cleanup.test.ts` (8 tests) already covers ordering, storage-before-metadata, failure isolation, idempotent retry, bounded run. Verified against source. |
| 4 | Frame flow vs DESIGN.md/UX_FLOW.md | **PASS (registry) / CONFLICT (Done)** | `lib/frames.ts` matches DESIGN.md §5.2 exactly (4 templates + none, colors = token values — canvas cannot use CSS vars). But Done.tsx renders a wax seal + Digital Keepsake download card contradicting DESIGN.md §5.6 ("Nothing else. No actions") and UX_FLOW.md §6 — see owner decisions. |
| 5 | A11y/contract fixes | **PASS — FIXED** (verified violations) | Lane des-1: 4 sub-44px guest controls fixed — PhotoReview delete/retry (28→44 hit area), Capture strip retry (20→44), camera switch (40→44). Visual design preserved; aria-labels verbatim. FrameSelection check badge is non-interactive — not a violation. |
| 6 | Regression validation | **PASS** | typecheck clean; vitest 354/354 (43 files); lint = known baseline only (1 pre-existing `any` error in `e2e/print-qa.spec.ts`; 13 warnings, all pre-existing drift); `npm run build` PASS; `npx playwright test e2e/mobile-media-qa.spec.ts` 19/19 (run by fix-1 post-change; orchestrator's only later edit was removing a now-unused eslint-disable comment — no behavior). Also fixed pre-existing e2e strict-mode failure at `mobile-media-qa.spec.ts:203` (locator scoped to 9:16 viewport box; backdrop img no longer double-matches). |

## Files changed this task

- `components/guest/screens/PhotoReview.tsx` — touch-target hit areas (delete/retry)
- `components/guest/screens/Capture.tsx` — touch-target hit areas (strip retry, camera switch 40→44px; strip `pt-7 -mt-7` so overflow clip no longer cuts the 44px zone)
- `components/guest-event-entry.tsx` — object-URL unmount cleanup reads refs; removed stale eslint-disable
- `e2e/mobile-media-qa.spec.ts` — frame-overlay locator scoped to 9:16 box (fixes pre-existing 18/19)
- `components/guest/screens/Done.tsx` — comment §5.4 → §5.6 (markup untouched)
- `.opencode/handoff/*` — lifecycle bookkeeping

No canonical docs, API, schema, or architecture changes. Not committed (per boundary).

## Blockers

None for UI freeze. One deployment blocker (pre-deploy, not pre-freeze): production env vars `TRUSTED_PROXY=1` and `CRON_SECRET` must be set in Vercel before launch — without TRUSTED_PROXY all guests share one global rate-limit bucket (mass-429 risk); without CRON_SECRET retention cleanup fails closed (runs as 500s).

## Owner decisions required (not resolved — silent change forbidden)

1. **DESIGN.md §5.6 vs Done.tsx** — §5.6 says "Nothing else. No actions, no navigation" on DONE; implementation renders an animated wax seal AND a Digital Keepsake download card ("Simpan ke Galeri Saya"). Either ratify an §5.6 amendment (wax seal + keepsake) or remove the extras. Note the wax-seal gradient also uses inline hex literals (`#f0d97a/#d4af37/#8a6d1f`) — deferred with this decision.
2. **Vercel env config** — set `TRUSTED_PROXY=1` + `CRON_SECRET` (+ existing documented secrets) in the Vercel project.

## Non-blocking debt (unchanged, documented in prior review)

- ffprobe `outputFileTracingIncludes` needs one live deploy verification (M1)
- signed-URL `expires_at` clock-skew (M2, TTL 900s — low impact)
- in-memory photo/voice rate limiter per-instance (accepted ADR-008 limitation)
- `types/supabase.ts` stale TODO (M7)
- `.tmp-status.txt` tracked in git (L4)
- lint baseline drift in untouched files

## UI freeze readiness

**Ready.** All verified A-category bugs in scope fixed or already covered;
frame registry reconciled with §5.2; tests/typecheck/build/e2e green; the only
open UI question is the §5.6 keepsake decision, which is a single bounded
screen and does not gate freezing the rest of the system.
