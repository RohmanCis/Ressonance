# T043-R Result

**Status:** COMPLETE

## Files changed (all in scope)

- `components/admin/admin-access.tsx`: "Share access"→"Bagikan akses", "Share event access."→"Bagikan akses acara.", guest-caption, scan caption, "URL publik" aria, "Salin link", "Cetak QR", "Link udah tersalin.", "Coba lagi", "Memuat detail akses", Shell eyebrow "Meja acara", offline/unavailable error copy.
- `components/admin/admin-preview-dialog.tsx`: dialog aria + mono header "Foto · N dari M" (via typeLabel), "Telusuri foto", "Foto sebelumnya"/"Foto berikutnya", "Unduh"/"Mengunduh…", "Tutup pratinjau"/"Tutup", "Coba lagi" ×2, "Memuat media…", `Foto dari {name}` alt, `dari {name}` in status text.
- `components/guest/screens/Capture.tsx`: "Jepret foto" (h2 + shutter), "Ganti kamera", `Sisa N dari M foto`, "Pilih foto" (aria+sr-only), "Pratinjau kamera", "Foto yang udah dijepret", `Foto N, {statusWord}` with new `photoStatusWord` map (belum terkirim/lagi dikirim/tersimpan/gagal terkirim/sesi habis), "Kirim ulang", "Tinjau foto" (sr-only h2 + img alt).
- `components/guest/screens/PhotoReview.tsx`: "Foto yang udah dijepret", `Foto N` alt, `Hapus foto N`, `Kirim ulang foto N: gagal terkirim`.
- `components/guest/screens/VoiceRecordingScreen.tsx`: "Stop rekaman"/"Rekam pesan suara".
- `components/guest/audio-player.tsx` (in scope via "Play voice note" aria): "Pemutar pesan suara", "Jeda pesan suara"/"Putar pesan suara", "Geser pesan suara".
- `components/guest-event-entry.tsx`: "Loading session usage"→"Memuat pemakaian sesi".
- `e2e/mobile-media-qa.spec.ts`: all English aria selectors synced (Jepret foto, Foto 1/2 regex, Rekam pesan suara, Stop rekaman, Putar pesan suara, Kirim ulang foto, Hapus foto 1/2, Tinjau foto dialog, `video[aria-label='Pratinjau kamera']`, `button[aria-label^='Foto 1']`). Absence checks ("Too short"/"Keep recording…") left as-is (still valid).
- `e2e/qr-qa.spec.ts`: "Bagikan akses acara.", "Salin link", "Cetak QR", "Link udah tersalin." ×2.
- `e2e/print-qa.spec.ts`: "Bagikan akses acara.", "Salin link", "Cetak QR" ×2.

Not touched (per exclusions): admin-sign-in.tsx, admin-ui.tsx, admin-page-shell.tsx, component-catalog.html, smoke.spec.ts, admin-index.spec.ts, docs, hooks/use-camera.ts (renders no text).

## Validation

- `npm run typecheck` — PASS
- `npx vitest run` (alone) — PASS, 46 files / 374 tests
- E2E — NOT run (per contract; orchestrator runs after designer lane lands)
- `git diff --check` — clean

## Failures

None.

## Risks / observations

- **admin-dashboard.tsx still has English** despite "first wave done": Shell eyebrow "Event desk", Retry ×3, "Closing…"/"Close event", metric "Voice notes", "Newest first", "Search by guest name" label+placeholder, "Filter by media type" aria, empty-state strings, sr-only "Loading submissions…"/"Loading event". Outside T043-R scope — needs a lane (designer/owner) or orchestrator reconciliation. Left untouched to avoid collision.
- `PreSession.tsx` img `alt="Unsaved draft"` (carry-over thumbnails) — outside T043-R file list; sweep gap if all guest alts must be Indonesian.
- `e2e/guest-flow-perf.mjs` (manual perf harness, not a Playwright spec) still uses old English selectors ("Take photos", "Photo 1", "Record voice note", "Stop recording") — would break if executed against the new strings.
- QR aria-labels ("QR code for event access"/"Printable QR code for event access") kept verbatim — "QR" loanword, e2e-asserted selectors (qr-qa/print-qa) unchanged.
- Print-artifact caption "Scan to share your photos and voice notes." not present in admin-access markup — nothing to translate (print-qa's `toBeHidden` still passes, absent element counts as hidden).

## Next step

Orchestrator: reconcile dashboard leftovers, run full e2e after designer lane lands, commit.
