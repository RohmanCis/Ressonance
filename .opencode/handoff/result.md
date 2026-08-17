# Result — comprehensive codebase QA audit (read-only)

> **Addendum 2026-08-17 (session close):** C1 and C2 below are RESOLVED — migration 0007 (explicit service_role table grants) and migration 0008 (storage.objects policies scoped to the private `guest-media` bucket for service_role; applied manually via dashboard) are applied live; migration history records 0001–0008; canonical docs reconciled (db_scheme, API_CONTRACT §8.8, ARCHITECTURE_DECISIONS ADR-002 follow-up, PRD open-questions, AGENTS.md §10). The A-L "doc records 0001–0005" item is likewise resolved. Remaining top-3 item: B-M2 `TRUSTED_PROXY` verification. The findings tables below are the original audit record.

## Status
DONE. Six lanes completed (A structure, B API layer, C DB/security, D frontend quality, E perf/reliability, F test coverage). All agents read mandatory docs; read-only respected (no repo files modified; handoff files only). Raw findings: **2 CRITICAL / 7 HIGH / 20 MEDIUM / 35 LOW** (≈57 unique after cross-lane dedupe). No fixes implemented per instruction.

## Consolidated findings by area

### A — Structure & Architecture (explorer) — 0C/0H/3M/10L
| Sev | Location | Issue |
|---|---|---|
| M | types/supabase.ts:1-7 (+9 routes) | Placeholder `Record<string, never>` + stale TODO → `as unknown as SupabaseClient` casts discard type safety repo-wide |
| M | lib/config.ts:1-8 | Docstring claims server boundary; missing `import "server-only"` |
| M | .env.example vs guest-messages/route.ts:27-28 | `GUEST_MESSAGE_RATE_LIMIT_*` used but undocumented |
| L | lib/supabase/client.ts; lib/utils.ts; components.json:16; app/page.tsx:8; lib/pending-photos.ts:11+lib/submit-photo.ts:26; lib/supabase/server.ts:29-31; app/admin/page.tsx:11-13; public/; docs/db_scheme.md:320 | Dead browser client; `cn` self-only; ui alias→nonexistent dir; stale scaffold landing copy; PHOTO_LIMIT duplicated; stale middleware comment; admin gate style inconsistent; no favicon; doc records 0001–0005 while 0006 exists |

### B — API Layer (explorer) — 0C/0H/2M/7L
| Sev | Location | Issue |
|---|---|---|
| M | photos/route.ts:73-77, voice-notes:77-81, guest-messages:66-67 | `getServerConfig()`+`pool.connect()` before try → DB outage returns HTML 500, violating JSON envelope |
| M | lib/rate-limit.ts:86 | Without `TRUSTED_PROXY=1` all guests share ONE global bucket (default 10 req/min event-wide) → mass 429 at live event. **Requires deployment env verification** |
| L | sign-in:38, session:79, admin/events:57; admin/events:23-28; cron:37; cron:65-77; admin/me:16-23; close:42-48; events GET:23+session:113 | Unbounded JSON body reads (3); unbounded event title; CRON_SECRET `!==` non-timing-safe; cron 500 body extra field; getUser conflates outage w/ 401; ARCHIVED→EVENT_ALREADY_CLOSED (conformant); service-role client outside try |

### C — DB & Security (oracle) — 2C/1H/4-5M/4L
| Sev | Location | Issue |
|---|---|---|
| CRITICAL | supabase/migrations (none touch storage) | Private bucket + storage.objects policies exist ONLY out-of-band (Dashboard). No in-repo guard; recreated-public bucket silently collapses media privacy. **Requires live DB/Dashboard verification** |
| CRITICAL | 0006:23 + media-cleanup.ts:159-167 | service_role DML for admins/events/guest_sessions/photos/voice_notes comes from NO migration — asserted via comment ("platform default-privilege wiring"). Retention-cron DELETE + event CLOSE UPDATE can fail at runtime. **Requires live DB verification** (incl. 0006 applied) |
| HIGH | media-cleanup.ts (+submit-photo.ts:124-144 tryDelete) | Orphaned storage objects (compensation-delete failure) never swept — TD §6 acknowledged, unimplemented |
| M | 0001/0004/0005 grants; 0006:23 | Grant-gap family (dup of CRITICAL F2 root); guest_messages lacks UPDATE/DELETE for future retention |
| M | admin-media-repo.ts:222; media-cleanup.ts:126-133; session-create-rate-limit.ts:30-43 | Index notes: cross-table JS sort; events(closed_at WHERE CLOSED) unindexed cron scan; rate-limit window sweep non-leading PK column — all acceptable MVP |
| L | lib/supabase/server.ts:12-35; admin/events:57; admin-event-repo.ts:92-95; admin-media-repo.ts:145 | No middleware session refresh (stale admin UI until 401); request.json unbounded (dup B); constraint match by message substring not code 23505; guest_name search exact/case-sensitive |

### D — Frontend Quality (explorer) — 0C/3H/4M/9L
| Sev | Location | Issue |
|---|---|---|
| H | guest-event-entry.tsx:488-495 | Unmount cleanup stale closure (`[]` deps, mount-time empty state) — revokes ZERO object URLs; comment is false. Fix: read `pendingPhotosRef` + refs |
| H | guest-event-entry.tsx:75-77,392-396,407 | Voice recorder no unmount cleanup — mic stream + interval live after navigating away mid-recording |
| H | app/ (root + all segments) | No error.tsx / global-error.tsx / not-found.tsx anywhere — render error crashes to default Next error page |
| M | guest-event-entry.tsx:219-241 | handleSessionExpired doesn't `camera.stop()` (dup w/ E) |
| M | :706; whole file; :943-1009 | Discard doesn't revoke expiredPending URLs; god component 1127 lines/~20 useState/3 state machines; ReviewOverlay no focus trap/Escape/aria-modal |
| L | :244-256+use-camera:125; :405; :420; use-camera:72-73; :854-861; admin-access:62-63; tsconfig.json; admin-ui:44 | capture() rejection unhandled; onstop overwrites voiceUrl unrevoked; voice ignores Retry-After; setCameraCount unguarded; overlay img no onError; silent admin catch; no noUncheckedIndexedAccess; 700-char line |

### E — Perf & Reliability (oracle) — 3H/4M/3L
| Sev | Location | Issue |
|---|---|---|
| H | admin-dashboard.tsx:144-158,427-436 | Per-tile eager signed-URL fetch: N photos = N HTTP calls × 5-hop sequential server chain (~100 DB hops for 20 photos); no cache; acknowledged `ponytail:` comment |
| H | media-cleanup.ts:86-118 | Cron sequential per-event loop ≈60 sequential round-trips → Vercel timeout risk (Hobby 10s) |
| H | guest-event-entry.tsx:219-241 | Camera stream leak on session expiry/close (LED stays on until unmount) — same root as D-M |
| M | cron route:37 (dup B/C); admin-media-repo.ts:79-114,236-255; guest-event-entry.tsx:306-389; app/e/[public_id]/page.tsx | CRON_SECRET non-timing-safe; resolveAuthorizedMedia 4–5 sequential round-trips; no AbortController (sync loop continues post-unmount); guest page is one full client bundle, zero server render |
| L | use-camera.ts:71-76; guest-event-entry.tsx:480-485, 411-424 | enumerateDevices unguarded; no symmetric camera-stop effect; voice stop/submit narrow race |

### F — Test Coverage (qa) — 0C/0H/2M/2L
Run: `npx vitest run` → **375/375 PASS** (41 files, 30.6s). No coverage reporter configured. All §9 critical paths covered; concurrency tested against real Postgres.
| Sev | Location | Issue |
|---|---|---|
| M | e2e (general) | No offline/network-interruption e2e test |
| M | e2e/mobile-media-qa.spec.ts | Hand-written mock literals, no shared fixture/Zod — drift-prone (2026-08-17 six-field drift caught manually) |
| L | vitest.config.ts; e2e/*.spec.ts | No coverage provider; e2e route-intercepted (not live) by default |

## Top 3 must-fix before production deploy
1. **C1 Storage privacy out-of-band** — verify live bucket `public=false` + storage.objects policies; add idempotent assert-migration so privacy can't silently regress.
2. **C2 service_role grants** — verify live grants (`information_schema.role_table_grants`), confirm 0006 applied; add explicit GRANT migration covering DELETE (photos/voice_notes) and UPDATE (events) or retention/close can fail in production.
3. **B-M2 rate-limit global bucket** — confirm `TRUSTED_PROXY=1` on Vercel (or per-identity limiting breaks: single 10 req/min bucket for ALL guests → mass 429 during a live event). One env-var verification/fix.

Runner-ups: camera+mic stream leaks (D/E), missing error boundaries (D), admin signed-URL waterfall (E), cron timeout (E).

## Systemic patterns
1. Resource lifecycle stops only at unmount — internal transitions (session expiry, event closed) don't stop camera/mic (D+E converge on guest-event-entry).
2. Infrastructure truth lives outside the repo — bucket privacy, service_role grants, Vercel env (TRUSTED_PROXY): three "requires live verification" clusters, all production-critical.
3. Sequential per-item round-trips where batching/parallelism would scale (admin signed URLs × 5-hop chain; cron per-event loop).
4. Positive: auth-before-body, error envelope, deny-all RLS + REVOKE, parameterized SQL, cookie/token hygiene (ADR-004), transactional compensation, and test depth are consistently excellent — zero authorization or injection findings.
5. Type-safety erosion from types/supabase.ts placeholder (12 `as unknown as` casts).
6. Minor recurring: unbounded reads/lengths on low-risk admin endpoints; one non-timing-safe secret compare.

## Validation
Audit-only; `npx vitest run` executed by qa lane (375/375 PASS). No repo files modified. Working tree = HEAD 27968aa + pre-existing uncommitted frames change-set (untouched) + handoff files (this audit).

## Next step
Owner triage: prioritize Top-3 (two CRITICAL verifications are deployment-blocking), then HIGH fixes (streams, boundaries, waterfalls, cron). No implementation started — fixes require explicit tasking.
