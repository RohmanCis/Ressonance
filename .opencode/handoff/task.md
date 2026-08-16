# Task: Guest message feature (Pesan & Kesan) — Opsi B

Boundaries: read AGENTS.md + canonical docs first. Standalone guest text message, independent of the voice note; not attached to voice_notes; never required. One message per guest session. Do NOT modify the voice note route, submit-voice-note.ts, or AGENTS.md. No new dependencies. No commit/push. Docs amendments (db_scheme.md, API_CONTRACT.md) are mandatory.

## Layers
1. **DB** — `supabase/migrations/0005_guest_messages.sql`: guest_messages(id, guest_session_id FK RESTRICT, message_text TEXT CHECK char_length 1–280, created_at); UNIQUE(guest_session_id) `uq_guest_messages_one_per_session`; index `idx_guest_messages_guest_session_id`. Amend `docs/db_scheme.md` (DDL, constraint/index summaries, remove implicit absence).
2. **API** — NEW `app/api/events/[public_id]/guest-messages/route.ts` (auth-before-body order: content-type → event/session auth → rate limit → bounded 4 KB JSON read → validate message_text → insert); NEW `lib/submit-guest-message.ts`; NEW `lib/guest-message-tx-repo.ts`; reuse `resolveVoiceNoteAuth` — do not duplicate auth. Amend session GET usage + `docs/API_CONTRACT.md` §6.6, §2, §4, §6.1; mark amendment "Amended 2026-08-17: guest message feature (Opsi B)."
3. **Guest UI** — `components/guest-event-entry.tsx`: messageText/messageState/messageError state; SessionData + guest_message fields; confirmUsage() reads them; submitMessage(); local GuestMessageAction component; usage-panel row "Message: Available/Sent".
4. **Admin (read-only)** — `app/api/admin/events/[public_id]/submissions` includes GUEST_MESSAGE items (id, type, created_at, public_ref, guest_name, message_text); local MessageTile in `components/admin/admin-dashboard.tsx`.

## Acceptance
201 on valid submit; 409 GUEST_MESSAGE_LIMIT_REACHED on second; 422 INVALID_INPUT w/ field detail on empty/>280; 401 SESSION_EXPIRED triggers handleSessionExpired(); session GET returns the two new fields; UI shows "Message sent." read-only after submit; voice flow unaffected; admin list includes GUEST_MESSAGE; tsc exit 0; vitest all pass with new route/unit tests.

## Validation
npx tsc --noEmit; npx vitest run.
