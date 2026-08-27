# Browser/E2E QA — Playwright Smoke

Non-canonical QA note. Describes the minimal Playwright smoke foundation only.
It does not define product behavior, screens, or states; those are owned by
DESIGN.md (root) and UX_FLOW.md (root) and the rest of the canonical set.

## Prerequisites

First-time browser install (downloads the Playwright Chromium runtime):

```bash
npx playwright install chromium
```

Runtime prerequisites: Node.js LTS (same as the app). The smoke suite runs in
Chromium only. No system FFmpeg is required for smoke tests (server-side audio
inspection is not exercised by this suite).

## Running the smoke suite

Local mode (boots `next dev` on `http://localhost:3000` automatically):

```bash
npm run e2e
```

External runtime (point at an already-running server, disables the local
web server):

```bash
set PLAYWRIGHT_BASE_URL=http://localhost:3000
npm run e2e
```

List the tests without a browser/runtime:

```bash
npx playwright test --list
```

## Live-dependent coverage

The suite is deterministic without Supabase by default. The guest Start-surface
test requires a live backend with a seeded ACTIVE event at
`/e/smoke-test-event`; enable it explicitly:

```bash
set PLAYWRIGHT_LIVE=1
npm run e2e
```

Without it, that one test is skipped.

## Scope

Smoke only: guest event entry shell, admin sign-in surface, admin dashboard
routing. No media upload, recording, or full-flow E2E. Browser matrix, camera,
and MediaRecorder behavior remain out of scope for this foundation.