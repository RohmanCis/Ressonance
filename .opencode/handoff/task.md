# Task: Admin Dashboard CLS Aside Skeleton + Parallel Fetch

Follow-up to the completed Lighthouse remediation (same file, uncommitted prior work stays). Two changes in `components/admin/admin-dashboard.tsx` only.

## 1. AsideSkeleton (CLS on /admin/events/[public_id])
- Replace `<Busy label="Loading event" />` in the aside loading branch with an `AsideSkeleton` component (local to this file, `animate-pulse`, `aria-hidden` visual + existing `role="status"`/sr-only "Loading event" text pattern like TimelineSkeleton).
- Reserve exact vertical space matching loaded state: eyebrow (12px line), title skeleton (~36px/h-9, matches h1 text-3xl), status badge (~24px/h-6 pill), 2 action buttons (`min-h-12`), with the same vertical rhythm (`mt-3`/`mt-6` gaps) as the loaded branch.
- Add `min-h-[300px]` (or measured equivalent) to the aside className so skeleton→loaded swap causes zero layout shift. Verify loaded content height ≤ reserved height at desktop (lg) and mobile stacking.

## 2. Parallel data fetch (LCP waterfall)
- In `AdminDashboard.load()`, replace sequential event→submissions awaits with:
  ```tsx
  const [eventRes, subsRes] = await Promise.all([
    api<{ event: Event }>(`/api/admin/events/${publicId}`),
    api<{ submissions: Submission[] }>(`/api/admin/events/${publicId}/submissions${suffix}`),
  ]);
  setEvent(eventRes.event);
  setItems(subsRes.submissions);
  ```
- Preserve busy/error handling exactly (single try/catch, same setError). Search `suffix` construction unchanged.

## Constraints
- No other files. No API/schema/docs changes. No new deps. strict TS.
- Don't disturb the prior session's changes (useInViewOnce PhotoTile, decoding attrs).

## Verification
1. `npm run typecheck` — 0 errors
2. `npx vitest run` — 354 pass
3. No Playwright (orchestrator runs it).

Write result.md per §9.
