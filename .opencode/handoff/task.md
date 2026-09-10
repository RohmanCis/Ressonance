# Task: Hard Delete Event (CLOSED only)

Commit message: `feat(admin): hard delete CLOSED event with storage cleanup`

## Spec corrections (binding — the originating spec had 2 errors)

1. **NO DB cascade exists.** All FKs are `ON DELETE RESTRICT` (docs/db_scheme.md:17,204 — `events→guest_sessions→photos/voice_notes`). You MUST delete child-first: `photos` → `voice_notes` → `guest_sessions` → `events`. Deleting the event row first will FK-violate.
2. **Storage prefix uses the DB event id (UUID), NOT public_id.** `storage_key` format is `events/{event_id}/sessions/{guest_session_id}/{photos|voice-notes}/{uuid}.{ext}` (API Contract §8.4). List+remove storage objects by fetching the event's DB `id` first, then listing all `storage_key`s of its photos/voice_notes from the DB rows (most reliable — do NOT guess/list by prefix in storage; collect keys from photos/voice_notes rows before deleting them). Batch `storage.from(bucket).remove(keys)` — see `lib/media-cleanup.ts:172-182` for the existing adapter pattern and `lib/config.ts` for bucket config.

## Lane A — Backend (fixer)

### 1. Amend docs/API_CONTRACT.md
Add §5.12 after §5.11 (sign out), following existing section style:

```
DELETE /api/admin/events/{public_id}
```
- Auth: Supabase Auth session required. Owner must own the event.
- Request body: none.
- Success: `200` `{ "deleted": true }`
- Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN` (event still ACTIVE — only CLOSED can be deleted; also non-owner), `404 NOT_FOUND`, `500 INTERNAL_ERROR`.
- Side effects: delete storage objects for the event, delete photos/voice_notes/guest_sessions metadata, delete the event row. QR/public links for the deleted public_id afterwards return `404 NOT_FOUND` (§6.1).
- Also update the §2 common-errors table note if needed (no new codes introduced; FORBIDDEN/NOT_FOUND already listed).

### 2. lib/admin-delete-event.ts (new)
Domain logic, pattern of `lib/admin-event-repo.ts`. Export a result-discriminated type + function:

```ts
export type DeleteEventResult =
  | { kind: "ok" }
  | { kind: "active_event" }   // event is ACTIVE → 403
  | { kind: "not_found" }
  | { kind: "error" };
```

Steps inside (repo-style, injected deps or direct SupabaseClient — follow admin-event-repo conventions):
1. Load event by public_id (`id, admin_id, status`) — reuse `findEventByPublicId`-style query. Not found → `not_found`.
2. Status ACTIVE → `active_event`. (Only CLOSED deletable.)
3. Collect session ids for event, then all photo + voice_note `storage_key`s (see lib/media-cleanup.ts:140-156 for the exact query pattern).
4. Delete DB rows child-first: photos (by session ids) → voice_notes (by session ids) → guest_sessions (by event id) → event (by public_id).
5. Delete storage objects: `storage.from(bucket).remove(keys)` in batches. Missing/already-deleted objects = success (S3-like). Storage delete failure after DB rows are gone must NOT fail the request into a misleading state — best-effort: log via existing structured logging convention (see lib/api-log.ts) and still return `ok` IF DB delete fully succeeded, since the daily media-cleanup cron no longer tracks the event; but if keys were collected, attempt removal before deleting the rows (so failures can still map to 500 with rows intact). Decide the safest ordering and document it in a brief docblock comment.
6. Bucket from env via the same config access pattern used by lib/media-cleanup.ts / lib/config.ts.

### 3. app/api/admin/events/[public_id]/delete/route.ts (new)
Follow `close/route.ts` exactly for auth (SSR client `getUser` → 401), ownership (event.admin_id !== user.id → 403 FORBIDDEN), 404, error envelope, `logApiError`, `runtime = "nodejs"`. Method: `DELETE`. Map lib results: ok → `200 {deleted:true}`, active_event → `403 FORBIDDEN` message `"Active event cannot be deleted. Close it first."`, not_found → 404, error → 500.

### 4. Test: app/api/admin/events/[public_id]/delete/route.test.ts
Pattern: existing route.test.ts files (e.g. close/route.test.ts — read it first). Cover:
- 401 unauthenticated
- 404 unknown event
- 403 non-owner
- 403 ACTIVE event (message asserted)
- success path: storage remove called with collected keys, DB deletes child-first, 200 {deleted:true}
- storage remove error handling per chosen ordering
- verify delete ordering (photos before voice_notes before guest_sessions before event) if the mock allows

### Constraints
- NO schema changes, NO new migrations, NO new dependencies.
- Never modify docs/ beyond the API_CONTRACT.md §5.12 amendment scoped above.
- `npx tsc --noEmit` must pass. `npx vitest run` must pass (full suite; serialized, do not parallelize).
- TypeScript strict, no `any` in new code. Sparse comments, canonical-doc cross-references only.
- Do NOT run e2e.
- Do NOT touch components/ (designer lane owns it).
- Do NOT commit — orchestrator commits after reconciliation.

## Lane B — Frontend (designer)

### components/admin/admin-dashboard.tsx only
Add "Hapus Event" destructive flow, DESIGN.md §6-conformant:

- Render condition: `event.status !== "ACTIVE"` (CLOSED), placed in the header action area where "Tutup acara" renders when ACTIVE (same slot — ACTIVE shows Tutup acara, CLOSED shows Hapus Event).
- Trigger button style (subtle, quiet, per spec):
  `min-h-11 rounded-lg border border-red-500/20 bg-transparent text-xs font-medium text-red-400/70 hover:border-red-500/40 hover:text-red-400 transition duration-fast` + existing `focusRing`. Label "Hapus Event".
- Confirm Dialog (shadcn Dialog already imported): title "Hapus event ini secara permanen?", body "Semua foto, pesan suara, dan data tamu akan dihapus selamanya. Tindakan ini tidak bisa dibatalkan.", buttons: "Batal" (secondary) + "Ya, hapus selamanya" (destructive: `border-red-500/30 bg-red-500/10 text-red-400` — match the existing close-dialog destructive button pattern at ~line 637).
- API call: `fetch(`/api/admin/events/${publicId}/delete`, { method: "DELETE" })` — use the existing `api` helper from admin-ui if it supports non-POST methods (read admin-ui.tsx first); otherwise plain fetch with same error-code extraction (response JSON `error.code`).
- Loading: button disabled, label "Menghapus…".
- Success: `router.replace("/admin")`.
- Error: quiet inline `text-xs text-error` message (role="alert") inside/near the dialog; map FORBIDDEN → "Acara masih aktif. Tutup dulu sebelum menghapus." and NOT_FOUND → "Acara udah nggak ada." (Bahasa Indonesia, casual-professional register per DESIGN.md §6).
- Keep all a11y conventions: focusRing, aria labels, DialogClose behavior, min touch targets.

### Constraints
- ONLY edit components/admin/admin-dashboard.tsx (+ read admin-ui.tsx for api helper). No other files.
- `npx tsc --noEmit` must pass.
- Do NOT commit.

## Validation owner
Orchestrator: typecheck + vitest + reconciliation, then single commit.
