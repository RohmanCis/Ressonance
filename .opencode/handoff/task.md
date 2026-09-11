# Task: Guest copy warmth pass (items 1–10) + DESIGN.md spec sync

Two parallel lanes. No file overlap. Owner-approved copy rewrites (designer audit des-1 ratified by owner). Bahasa Indonesia, santai register. NO logic/behavior changes — strings only.

Global constraints: TypeScript strict, no `any`, no new deps. Orchestrator runs `npx vitest run` ONCE after both lanes terminal (serialized destructive suites). Per-lane validation: `npx tsc --noEmit` (fixer lane). Do not touch files outside your lane scope. Bahasa Indonesia copy register santai.

## Lane copy-1 — @fixer: code copy updates (items 1–10)

Read first: AGENTS.md, docs/DESIGN.md §5.4–§5.6 (for context; spec updated in parallel by librarian lane — do not edit docs/), lib/pending-photos.ts, lib/pending-photos.test.ts, components/guest/screens/PhotoReview.tsx, components/guest/screens/VoiceRecordingScreen.tsx, components/guest/screens/Done.tsx, components/guest-event-entry.tsx.

Exact final strings (use verbatim):

**Item 1 — lib/pending-photos.ts:148-169 `photoErrorMessage()`** — translate all English strings:
- UNSUPPORTED_FORMAT → `Format fotonya nggak didukung. Pilih foto lain.`
- FILE_TOO_LARGE → `Fotonya kegedeen. Pilih yang lebih kecil.`

Update `lib/pending-photos.test.ts` expected strings to match (around lines 200-211). Also grep repo (`e2e/`, `components/`) for any other assertion/usage of the old English strings and sync if found.

**Item 2 — components/guest-event-entry.tsx:~491** (voice too-short error): final `Terlalu singkat. Minimal 5 detik ya.` (delete "— hasil akhirnya tetap server yang menentukan.")

**Item 3 — components/guest/screens/PhotoReview.tsx:~233**: `Sedang menyelaraskan foto dengan server…` → `Lagi ngirim foto…`

**Item 4 — PhotoReview.tsx:~217**: `Ketuk ikon putar atau hapus sebelum lanjut.` → `Ketuk ↻ buat kirim ulang, atau hapus fotonya sebelum lanjut.`

**Item 5 — components/guest/screens/VoiceRecordingScreen.tsx:~195**: `Dengarkan rekamanmu sebelum disimpan. Kamu bisa mengulang jika ingin mengubah isi ucapan.` → `Dengerin dulu rekamannya. Mau diubah? Rekam ulang aja.`

**Item 6 — VoiceRecordingScreen.tsx:~157**: `Momen acara telah berakhir. Kiriman pesan baru tidak diterima lagi.` → `Acaranya sudah selesai, jadi pesan baru nggak bisa dikirim lagi.`

**Item 7 — components/guest-event-entry.tsx:~539**: `Rekam ulang di rentang itu.` → `Rekam ulang ya.` (keep the 5–30s sentence before it intact)

**Item 8 — components/guest/screens/Done.tsx:~188**: `Host akan melihatnya setelah acara.` → `Yang punya acara akan lihat setelah acara selesai.`

**Item 9 — VoiceRecordingScreen.tsx**:
- :~118 helper: delete `secara personal` (keep rest of sentence: `Ungkapkan doa & ucapan hangat untuk kedua mempelai.`)
- :~190 min-duration warning: `Pesan suara minimal 5 detik agar dapat disimpan. Silakan rekam ulang.` → `Pesan suara minimal 5 detik. Rekam ulang ya.`
- :~290 status line: `Tahan berbicara…` → `Lanjut ngomong…` (keep `(Ns lagi)` suffix)

**Item 10 — PhotoReview.tsx:~96**: `Kamu bisa memotret ulang, menghapus, atau lanjut simpan.` → `Mau jepret ulang, hapus, atau lanjut? Bisa semua.`

After edits: run `npx tsc --noEmit` (must pass). Also grep `e2e/` for any of the OLD strings above — if a spec asserts one, update the spec selector and note it in your report. Do NOT run vitest. No e2e run. Report files changed + tsc result in final message; do not write result.md (orchestrator writes it).

## Lane doc-1 — @librarian: DESIGN.md spec sync (items 8–10 copy)

Edit docs/DESIGN.md ONLY (no other files). Update the spec copy to match the new strings above:

- §5.4 Photo Review (line ~151): helper copy `Kamu bisa memotret ulang, menghapus, atau lanjut simpan.` → `Mau jepret ulang, hapus, atau lanjut? Bisa semua.`
- §5.5 Voice Note (line ~156): helper `Unggapkan doa & ucapan hangat untuk kedua mempelai secara personal.` → drop `secara personal` → `Ungkapkan doa & ucapan hangat untuk kedua mempelai.`
- §5.5 (line ~157): `Tahan berbicara… (Ns lagi)` → `Lanjut ngomong… (Ns lagi)`
- §5.5 (line ~159): `Pesan suara minimal 5 detik agar dapat disimpan. Silakan rekam ulang.` → `Pesan suara minimal 5 detik. Rekam ulang ya.`
- §5.6 Done (line ~171): `Host akan melihatnya setelah acara.` → `Yang punya acara akan lihat setelah acara selesai.`

For each changed line, append marker: `(Amended 2026-09-12: copy warmth pass — align tone, remove English/formal words)` — place at end of the affected sentence/clause or as trailing note on the bullet, whichever reads cleanest. Preserve all other spec content exactly.

Report exact lines changed + before/after in final message. Do not write result.md.
