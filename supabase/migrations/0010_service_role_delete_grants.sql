-- Migration 0010: pin service_role DELETE on events and guest_sessions
--
-- Migration 0007 pinned the minimum service-role privileges verified at the
-- time. The admin hard-delete endpoint (API Contract §5.12, implemented
-- 2026-09-11 in lib/admin-delete-event.ts) adds service-role DELETE on
-- events and guest_sessions (photos/voice_notes DELETE was already pinned).
-- Live privileges currently work via platform default grants; this pins
-- them explicitly so a future platform default-privilege change cannot
-- break event deletion, following the 0007 philosophy.
--
-- Idempotent: safe to re-run (re-granting the same privileges is a no-op).

GRANT SELECT, INSERT, UPDATE, DELETE ON events TO service_role;
GRANT SELECT, INSERT, DELETE ON guest_sessions TO service_role;
