# Task: Apply migration 0009 to live Supabase DB

## Context
- Repo: D:\2026\ressonance. Remote: https://github.com/RohmanCis/Ressonance (verify with `git remote -v`).
- Live DB records migrations 0001–0008. Local repo has 0001–0004, 0007–0009 (0005/0006 deleted intentionally during guest-message feature removal).
- Target: apply `supabase/migrations/0009_drop_guest_messages.sql` (`DROP TABLE IF EXISTS public.guest_messages;` — idempotent) to live DB.

## Steps
1. Read AGENTS.md (repo root) and `supabase/migrations/0009_drop_guest_messages.sql`.
2. `npx supabase db push --linked`
3. If it fails because not linked: `npx supabase link --project-ref gwczcwlysvymuomsqhdc`, then retry push.
4. KNOWN RISK: remote history has 0005/0006 which are absent locally (deleted intentionally). `db push` may warn/error about remote-only migrations or prompt for repair. Do NOT run `supabase migration repair` without reporting first. If push prompts interactively or fails on history mismatch, STOP and report the exact output.
5. If `supabase link` requires login (no access token), STOP and report — do not handle credentials.

## Constraints
- Do NOT modify any file in the repo (no code, no migrations, no docs, no handoff files except result.md).
- Do NOT run destructive SQL beyond what `db push` does with migration 0009.
- Do NOT print secrets.

## Report in result.md
- Success/failure of migration, full command output, any prompts encountered, final verification (e.g. `npx supabase migration list` or equivalent showing 0009 applied).
