# Result — T028: Vercel Runtime Compatibility

Status: COMPLETE. All verification PASS. Not committed.

## Files changed (6)
1. next.config.ts — added outputFileTracingIncludes (`/api/events/*` →
   `@ffprobe-installer/linux-x64/**`) + serverExternalPackages (webpack can't
   bundle dynamic require.resolve). Top-level Next.js 15.1 config keys.
2. package.json — added `@ffprobe-installer/ffprobe@^2.1.2` (dependencies).
   Ships own TS types; platform binaries via optionalDependencies.
3. app/api/events/[public_id]/voice-notes/route.ts — import ffprobeInstaller;
   line 213 now `process.env.FFPROBE_PATH ?? ffprobeInstaller.path`.
4. lib/db.ts — Supavisor compatibility documented in comment. No `prepare:false`
   added: pg 8.x uses unnamed prepared statements (query.js:35-58 confirms
   requiresPreparation() uses empty this.name), Supavisor transaction-mode only
   rejects NAMED statements. Codebase has none. @types/pg 8.21 has no prepare
   field. Reversion correct.
5. lib/rate-limit.ts — ponytail comment expanded with Vercel per-instance
   limitation note (accepted MVP limitation per ADR-008).
6. .env.example — DATABASE_URL section: Supavisor pooler guidance (port 6543).
   FFPROBE_PATH: commented out, defaults to bundled binary.

## Spec deviations (3, all verified correct)
1. `prepare: false` reverted — not a valid pg 8.x/@types/pg 8.21 option;
   unnecessary for Supavisor (unnamed statements). Comment documents rationale.
2. `serverExternalPackages: ["@ffprobe-installer/ffprobe"]` added — required
   for `next build` to succeed (dynamic require.resolve breaks webpack).
3. .env.example FFPROBE_PATH commented out (not `=ffprobe`) — bundled binary
   is the new default; env var is override-only.

## Verification (all PASS)
- typecheck: exit 0
- test: 242/242 PASS (27 files)
- build: exit 0, voice-notes route compiled (158 B / 103 kB)
- lint: 0 errors, 5 pre-existing warnings
- ffprobe resolution: `@ffprobe-installer/win32-x64/ffprobe.exe` exists,
  binary accessible

## SSOT conflict: NONE
## Architecture drift: NONE
## Blockers: NONE

Next: orchestrator marks T028 complete. Next deployment task (separate):
Supabase provisioning runbook (apply migration 0001, create private bucket,
configure Auth) + seed/smoke strategy + Vercel env/secret manifest.
