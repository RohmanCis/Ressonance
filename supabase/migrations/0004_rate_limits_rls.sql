-- Migration 0004: lock down session_create_rate_limits (RLS + REVOKE)
--
-- Migration 0003 created the table without the RLS/REVOKE boundary that
-- migration 0001 applies to the five product tables. Supabase default
-- privileges grant new public-schema tables to anon/authenticated via
-- PostgREST; the anon key ships in the client bundle, so an attacker could
-- read/reset the rate-limit counters and defeat R1 (ADR-008). This closes
-- that gap to match the 0001 boundary: RLS enabled with no policies
-- (deny-all for anon/authenticated), and default grants revoked.
-- The service-role/pg connection (table owner) retains access via the
-- owner bypass of RLS, exactly as for the 0001 tables.
--
-- Idempotent: safe to re-run.

ALTER TABLE session_create_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON session_create_rate_limits FROM PUBLIC;
REVOKE ALL ON session_create_rate_limits FROM anon;
REVOKE ALL ON session_create_rate_limits FROM authenticated;
