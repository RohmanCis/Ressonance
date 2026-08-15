# Task: Release-readiness fixes 1–7 (audit items, no owner decisions)

Boundaries: read AGENTS.md first. Do NOT touch C1–C5 items, search semantics, rate-limit architecture, signed-URL TTL, retention, API behavior (unless required), R3 deployment, unrelated features, canonical docs (except db_scheme RLS reconciliation by orchestrator). No commit/push.

## Item 1 — RLS hardening (ORCHESTRATOR ONLY, do not duplicate)
Migration 0004: ENABLE RLS + REVOKE on `session_create_rate_limits`. Apply live + verify.

## Item 2 — Production TLS (ORCHESTRATOR ONLY)
`.env.example` + handoff R3 docs: production `DATABASE_URL` needs `?sslmode=require`. No secrets. Local dev unchanged.

## Item 3 — TRUSTED_PROXY (ORCHESTRATOR ONLY)
Record `TRUSTED_PROXY=1` for Vercel production in `.env.example` + R3 prerequisites. No code change.

## Item 4 — Guest sync correctness (FIXER F1)
Files: components/guest-event-entry.tsx, lib/pending-photos.ts (+ lib/pending-photos.test.ts).
- Sync loop + retry/delete/retake: match items by stable `photo.id` (nextPendingId already exists), not array index.
- While an item is `uploading`, its delete/retake must be prevented (canDelete/canRetake honor status); deletions of OTHER items mid-sync must not mislabel statuses.
- Retry-After: finite positive number → use; invalid/missing → fallback 5s. Test NaN, negative, 0, garbage, missing, valid.
- Add focused tests: delete/retake during sync identity-safety; malformed Retry-After parsing.
- Keep UI_UX §4.3 semantics exactly (session error → abort+expiry; EVENT_CLOSED → error no retry; PHOTO_LIMIT → error + break; RATE_LIMITED → pause+resume).

## Item 5 — Admin download failure handling (FIXER F2)
Files: components/admin/admin-dashboard.tsx (+ new test file lib/ or components/ *.test.ts(x)).
- Replace `window.location.href = /download` (3 sites: DownloadButton, dialog ~line 409) with graceful handling: fetch, on 302-signed-URL follow → trigger browser download (fetch→blob→object URL anchor click preserves 302 server behavior); on 401/403/404/500/502 JSON error → per-item alert with the item name + Retry button (UI_UX §5.2:153).
- Never surface raw JSON envelope text to the user; map codes to safe messages (reuse existing patterns in admin-ui.tsx).
- Keep 302 endpoint untouched.
- Add focused tests for the failure → error-state + retry mapping logic (extract pure mapper if cleanest).

## Item 6 — Fonts (FIXER F3)
Files: app/layout.tsx, app/globals.css.
- Fraunces (display) + DM Sans (body) via `next/font/google`, CSS variables wired into existing `--font-display` / `--font-sans` tokens (globals.css:65-66). No other redesign; no layout shifts beyond font metrics.
- Body already `font-sans`; ensure display token actually applied where previously referenced (event titles/headings use `font-display` already? verify — if not referenced anywhere, map variable only, do NOT restyle components beyond font-family).
- Verify build compiles (next/font requires network at build; if build offline, use `<link>` Google Fonts in layout head as fallback strategy — report which).

## Item 7 — Mobile safe-area (FIXER F1)
Files: components/guest-event-entry.tsx (CSS only).
- `env(safe-area-inset-bottom)` padding on the fixed/sticky guest bottom controls (shutter row, bottom band, pending strip Send area).
- Preserve layout/accessibility; no layout redesign.

## Validation (each fixer: run own focused tests; orchestrator runs full battery after)
npm run typecheck && npx vitest run <focused files> for changed behavior.
