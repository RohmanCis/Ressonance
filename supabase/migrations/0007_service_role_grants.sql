-- Migration 0007: explicit service_role grants for all server-side operations
--
-- Migration 0006 established that service_role is NOT a superuser on Supabase
-- (rolsuper = false): it only holds BYPASSRLS, which skips row policies, not
-- table GRANTs. The 0001 tables currently work because the platform's earlier
-- default-privilege wiring granted them full DML. This migration pins the
-- server-only read/write path explicitly, per table, so a future platform
-- default-privilege change cannot break the API the same way.
--
-- Privileges below are the minimum required by the actual service-role client
-- usage verified in this repository (lib/ and app/api/):
--   * photos / voice_notes — SELECT for admin listings, media resolution,
--     usage counts, and the retention scan; DELETE for the retention cron.
--     Inserts flow through the direct-pg tx repos (photo-tx-repo /
--     voice-note-tx-repo), which connect as the table owner, so no INSERT
--     grant is needed.
--   * events — SELECT for lookups; INSERT for createAdminEvent (POST
--     /api/admin/events); UPDATE for closeAdminEvent (POST .../close).
--   * guest_sessions — SELECT for usage/admin/cleanup queries; INSERT for
--     GuestSession start (POST /api/events/{public_id}/session).
--
-- Deliberately NOT granted (verified 2026-08-17, no service-role client
-- usage; owner decision):
--   * admins — admin auth uses Supabase Auth (auth.getUser → auth.users),
--     never the public.admins table. FK referential-integrity checks do not
--     require SELECT on the referenced table, so events INSERT needs no
--     admins grant either.
--   * session_create_rate_limits — the rate limiter connects via the direct
--     pg pool (getPgPool, table owner), never the service-role client.
--
-- Direct-pg paths connect as the table owner and are unaffected either way.
--
-- Idempotent: safe to re-run (re-granting the same privileges is a no-op).

GRANT SELECT, DELETE ON photos TO service_role;
GRANT SELECT, DELETE ON voice_notes TO service_role;
GRANT SELECT, INSERT, UPDATE ON events TO service_role;
GRANT SELECT, INSERT ON guest_sessions TO service_role;
