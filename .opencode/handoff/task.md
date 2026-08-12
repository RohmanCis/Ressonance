# T005 — Next MVP Slice

## Status
Complete. Verification passed.

## Objective
Implement `GET /api/events/{public_id}/session` per `docs/API_CONTRACT.md` §6.3. Add reusable cookie/session resolution helpers and focused tests. Do not modify canonical documents, migrations, or upload endpoints. Do not invent expiry policy.

## Acceptance
- Valid same-event cookie returns `200` usage shape with event status and photo/voice counts.
- Missing/invalid/mismatched cookie returns `401` stable error; invalid-session responses clear cookie.
- Unknown event returns `404`; CLOSED event remains readable.
- No token, database PK, or storage key exposure.
- `npm test`, `npm run typecheck`, `npm run lint` pass.

## Checks
- Hard `server-only` boundary and existing server caller.
- Start-only configurable rate limiting and `429 RATE_LIMITED`.
- Required route tests and token/cookie protections.
- Accurate `AGENTS.md` §10 state and handoff authority protection.
- No RPCs, `SECURITY DEFINER`, Next.js upgrade, canonical changes, T005, unrelated scope.
- `npm test`, `npm run typecheck`, `npm run lint`, route tests, mechanical boundary check.

## Note
No separate `npm run test:postgres` script is required by the task or canonical documents; DB integration tests run through `npm test` and passed with the available database.

## Completion evidence
Implementation and QA evidence recorded in `result.md`. QA verdict GREEN; no blockers, SSOT conflict, or architecture drift. No canonical documents modified.
