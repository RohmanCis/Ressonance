# Current Task Status

**Status:** COMPLETE — review-remediation wave done + verified (2026-08-27). Uncommitted, ready to commit.

Changes (fix-1, diff inspected): red→error tokens + `var(--overlay)` shadow + shared status-pill mapping (Capture.tsx); NEW `components/guest/ambient-backdrop.tsx` (Shell + PreSession dedupe); NEW `components/guest/screens/expiry-hint.tsx` (PhotoReview + VoiceRecording dedupe); `formatTime` exported + 6 new tests. Verification (orchestrator-run): typecheck 0, vitest 360/360, lint = baseline (1+12), e2e 37/1skip. Before/after metrics in `result.md`.

**Remaining owner wave (deferred, doc-ratification):** lightbox prev/next, low-power ambient tier, pre-expiry hints on PhotoReview/Voice → DESIGN.md amendments; UX_FLOW.md §2 "Nama Anda"→"Nama kamu" sync; FrameSelection label vs DESIGN.md §5.2 ("Pilih Bingkai" vs "Gunakan Bingkai {Frame}"); gold-on-uploading-ring ratify-or-demote; dialog.tsx token strip; hooks mediaFilter/useInViewOnce/useLowPowerAmbient tests (need jsdom or refactor); rgba literals in VoiceRecordingScreen/PreSession (out of scope this wave).

**Pre-deploy blocker:** `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel. Push still pending (13 ahead of origin/main).
- Note: perf wave already committed clean as `92bb5ec` (7 files, +161/−97); prior defective `330e2a1` reset pre-push; stray PNGs/dev-server.log deleted.
- Skills installed (global): vercel-react-best-practices, supabase-postgres-best-practices, playwright-best-practices.
- Owner is considering deploy in parallel; push still pending (13 ahead of origin/main).

## Prior task (COMPLETE — 2026-08-27)
Authenticated dashboard Lighthouse (fresh prod build, live admin): **perf 93, a11y 100, BP 100, SEO 100, CLS 0, TBT 0**. Before/after + limits in `result.md`. Committed `92bb5ec`.
