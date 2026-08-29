# Task

T043-R — Remainder of the Indonesian UI sweep (owner-approved). First wave
(admin sign-in/event-index/dashboard/ui + docs) is done in the working tree.
A designer lane separately owns `admin-sign-in.tsx` / `admin-ui.tsx` /
`admin-page-shell.tsx` — DO NOT touch those files.

## Scope (all files below are yours)

### 1. `components/admin/admin-access.tsx` + `components/admin/admin-preview-dialog.tsx`

Translate all user-facing strings (owner tone: casual-but-professional —
"nggak"/"buka"/"udah" register):

access: "Share access"→"Bagikan akses", "Share event access."→"Bagikan akses
acara.", "Guests can scan this access card or open the public link."→"Tamu
bisa scan kartus ini atau buka link publiknya.", "Scan with a phone camera to
open the guest page, or share the public link."→"Scan pakai kamera HP buat
buka halaman tamu, atau bagikan link publiknya.", "Public URL" aria→"URL
publik", "Copy link"→"Salin link", "Print QR"→"Cetak QR", "Link copied to
your clipboard."→"Link udah tersalin.", "Retry"→"Coba lagi". Check for a
print-artifact caption "Scan to share your photos and voice notes." → "Scan
buat bagikan foto dan pesan suaramu." if present.

preview-dialog: aria-labels "Previous photo"/"Next photo"→"Foto
sebelumnya"/"Foto berikutnya", "Navigate photos"→"Telusuri foto", "Download"→
"Unduh", "Close preview"→"Tutup pratinjau", "Retry"→"Coba lagi", header label
"Photo · N of M"→"Foto · N dari M", "Voice note · N of M" style labels →
"Pesan suara · N dari M" (inspect actual labels), sr-only "Loading photo…"→
"Memuat foto…" etc. Keep e2e-asserted accessible names in sync (see §3).

### 2. Guest aria-labels / sr-only / placeholders

Files: `components/guest/screens/Capture.tsx`, `PhotoReview.tsx`,
`components/guest/VoiceRecordingScreen.tsx` (locate via glob), `components/
guest-event-entry.tsx`, `hooks/use-camera.ts` if it renders text.

- "Take photos" sr-only heading → "Jepret foto"
- "Switch camera" → "Ganti kamera"
- "N of M photos remaining" → "Sisa N dari M foto" (keep numeric interpolation)
- "Captured photos" list aria → "Foto yang udah dijepret"
- "Photo N, confirmed" → "Foto N, tersimpan"; "Photo N, uploading" → "Foto N,
  lagi dikirim"; keep other states consistent ("belum terkirim", "gagal
  terkirim" — match existing statusPill vocabulary)
- "Choose a photo" → "Pilih foto"
- "Take photo" (shutter) → "Jepret foto"
- "Photo review" sr-only → "Tinjau foto"
- "Delete photo N" → "Hapus foto N"
- "Retry photo N: upload failed" → "Kirim ulang foto N: gagal terkirim"
- "Record voice note" → "Rekam pesan suara"
- "Stop recording" → "Stop rekaman"
- "Play voice note" → "Putar pesan suara"
- "Loading session usage" → "Memuat pemakaian sesi"
- Any other English aria/sr-only/placeholder found in these files → translate
  same register; visible Indonesian copy stays untouched.

### 3. E2E sync

- `e2e/mobile-media-qa.spec.ts`: update all English aria-based selectors to
  the new strings above. Note `doneHeading` already targets receipt copy;
  heading "Take photos" assertions → "Jepret foto".
- `e2e/qr-qa.spec.ts` + `e2e/print-qa.spec.ts`: "Share event access." →
  "Bagikan akses acara.", "Copy link" → "Salin link", "Print QR" → "Cetak QR",
  "Link copied to your clipboard." → "Link udah tersalin.", print caption if
  asserted.
- `e2e/smoke.spec.ts` + `e2e/admin-index.spec.ts` are ALREADY synced — do not
  touch.
- Do not touch `component-catalog.html` (separate orchestrator lane).

## Constraints

- Text-only changes. No visual/layout edits. No doc edits. No new deps.
- No changes to `components/admin/admin-sign-in.tsx`, `admin-ui.tsx`,
  `admin-page-shell.tsx`, `component-catalog.html`.
- Server/API error messages unchanged.

## Validation

`npm run typecheck` PASS; `npx vitest run` PASS (alone). Do NOT run e2e
(orchestrator runs full suite after designer lane lands). Do not commit.

Write result.md (status, files changed, validation, risks) and return summary.
