# Current Task Status

**Status:** IDLE — admin ambient + access/index/dashboard redesign complete 2026-08-24.
**Completed this session:** 6 commits on main (remote RohmanCis/Ressonance), implementing owner decisions from the des-1 audit (grain+orbs, bare-QR print, no-scroll access, Linear hairline rows, dot status, mono URL):
1. `4e38f6a` — Shell ambient: orbs + film-grain + z-10 wrapper on all admin pages (PreSession-parity; globals.css already had utilities).
2. `cf5bc15` — typography: h1 leading/tracking, sign-in double-eyebrow resolved (Shell eyebrow now optional prop), intro copy text-sm leading-relaxed, URL font-mono.
3. `e5b0fd2` — admin-access single no-scroll card (QR 160px / underline URL / Copy gold-foil + Print QR secondary); print = bare 80mm QR, @page margin 0; menu/variants/back-link removed; qr-qa + print-qa specs updated in-commit.
4. `65bc9c6` — event index hairline rows (divide-y), ACTIVE wash + gold left border + dot "Active" (English, orchestrator override of spec's Aktif/Selesai — flagged for owner), CLOSED plain "Closed"; additive e2e lock-in assertions.
5. `ea67cf9` — dashboard: GuestGroup divide-y, PreviewDialog shadow-2xl, TimelineSkeleton animate-pulse; FIX-9 sweep clean.
6. `da77988` — orchestrator fix: print-only QR artifact aria-label ("Printable QR code for event access") + print-qa visibility assertion (was ambiguous with print:hidden screen QR).

**Validation:** tsc PASS ×6; vitest 354/354 (43 files); e2e admin-index + qr-qa + print-qa 16/16 PASS. Guest files, docs/, globals.css, AGENTS.md untouched.
**Owner-review flags (from fix-1, in result.md):** English "Active"/"Closed" labels (spec said Aktif/Selesai); bare-QR print = 80mm on margin-0 A4 (QR-dedicated page, not full-bleed); row links min-h-12 touch targets.
**Prior open decisions resolved this session:** ambient gold on admin, QR-only print, access mobile layout, index row treatment, status indicators, URL typography, sign-in double eyebrow. Still open: §6 "Access/QR per row" (ACTIVE-only behavior kept, e2e-locked). Dashboard section headings stay sans (§6, status quo).
**Pre-deploy blocker:** `TRUSTED_PROXY=1` + `CRON_SECRET` in Vercel.
**Next:** Idle. Awaiting owner.
