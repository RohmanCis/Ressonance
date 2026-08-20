-- Migration 0009: drop guest_messages (feature removed from MVP scope)
--
-- The guest message feature ("pesan & kesan") was removed from the MVP scope
-- on 2026-08-20 (owner decision). Migrations 0005/0006 files were deleted from
-- the repo during that removal; this migration cleans the live schema so the
-- database matches the repo (schema-drift fix).
--
-- The table holds no rows and has no inbound foreign keys, so the drop is
-- safe. The DROP is idempotent: re-running is a no-op.
--
-- Idempotent: safe to re-run.

DROP TABLE IF EXISTS public.guest_messages;
