import "server-only";

import { Pool } from "pg";

/**
 * Lazy Postgres connection pool for operations that require direct
 * transaction/locking control (TECHNICAL_DESIGN §2, §6, §8). The photo
 * submission holds a GuestSession row lock across a storage upload, which the
 * Supabase JS client cannot express; a raw `pg` client is used instead.
 *
 * ponytail: a single lazy pool suits the single-instance MVP. Revisit when a
 * multi-instance topology or managed connection scaling is approved.
 */
let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}