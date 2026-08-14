# T030 — Guest Capture UX Redesign

## Phase 1 (approved + complete): SSOT amendments
Amend `docs/UI_UX.md` §4.2, §4.3, §7 and `docs/UI_DESIGN.md` §9, §11 to reflect
camera-first + multi-capture + batch-sync design. No application code. No other
canonical docs.

## Phase 2 (approved + complete + owner QA PASS): Implementation
Camera-first post-Start capture screen, multi-capture pending buffer, sequential
batch sync via existing POST /photos, per-item states, session expiry with
explicit carry-over, file-picker fallback, voice flow unchanged.

No new endpoints, error codes, schema, dependencies, filters, AI, or social
features.

## Authority
- `AGENTS.md` §3, §8, §9
- `docs/UI_UX.md` §4.2, §4.3, §7 (as amended in Phase 1)
- `docs/UI_DESIGN.md` §9, §11 (as amended in Phase 1)
- `docs/API_CONTRACT.md` §6.4 (unchanged — no API changes)
- `docs/PRD.md` §6 L177 (client-side drafts may remain visible after expiry)
- `docs/TECHNICAL_DESIGN.md` §5 (no quota transfer, no expired-session reuse)
