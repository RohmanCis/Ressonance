import { test, expect, type Page } from "@playwright/test";

// T030 Mobile-Media QA — guest flow (DESIGN.md §5): frame-select → capture →
// photo-review → voice-note (dedicated full-screen step) → done
// (route-intercepted). Device: Chromium 130+ on Windows, emulating mobile
// viewport (375x812). Uses --use-fake-device-for-media-stream +
// --use-fake-ui-for-media-stream to simulate camera/mic without real hardware.

const EVENT_ID = "qa-media-event";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// --- Mock helpers ---

function mockEventApi(page: Page, status: "ACTIVE" | "CLOSED" = "ACTIVE") {
  page.route(`**/api/events/${EVENT_ID}`, async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { title: "QA Media Event", status } }),
    });
  });
}

function mockStatefulSession(page: Page, opts?: { photos?: number; voice?: boolean; eventStatus?: "ACTIVE" | "CLOSED" }) {
  let photosSubmitted = opts?.photos ?? 0;
  let voiceSubmitted = opts?.voice ?? false;
  const eventStatus = opts?.eventStatus ?? "ACTIVE";

  // Usage shape must match API Contract §4/§6.3: four fields. The app
  // validates all four on GET; omitting any leaves the UI stale.
  const usage = () => ({
    guest_name: "QA Tester",
    photos_submitted: photosSubmitted,
    photos_remaining: 5 - photosSubmitted,
    voice_note_submitted: voiceSubmitted,
    voice_note_available: !voiceSubmitted,
  });

  page.route(`**/api/events/${EVENT_ID}/session`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ session: usage() }),
      });
    } else {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ...usage(), event: { title: "QA Media Event", status: eventStatus } }),
      });
    }
  });
  return {
    addPhoto: () => { photosSubmitted++; },
    addVoice: () => { voiceSubmitted = true; },
    getPhotos: () => photosSubmitted,
    getVoice: () => voiceSubmitted,
  };
}

// Contracted usage shape for upload-route mocks (API Contract §4/§6.4–§6.5):
// four fields. The app's confirmUsage() validates all four; serving a partial
// shape here previously masked real state sync.
function uploadUsage(session: ReturnType<typeof mockStatefulSession>) {
  return {
    guest_name: "QA Tester",
    photos_submitted: session.getPhotos(),
    photos_remaining: 5 - session.getPhotos(),
    voice_note_submitted: session.getVoice(),
    voice_note_available: !session.getVoice(),
  };
}

function mockPhotoUpload(page: Page, status: number, body: Record<string, unknown>) {
  page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

function mockPhotoUploadSuccess(page: Page, session: ReturnType<typeof mockStatefulSession>, delayMs = 200) {
  page.unroute(`**/api/events/${EVENT_ID}/photos`);
  page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
    session.addPhoto();
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({ submission: { id: `p${session.getPhotos()}`, type: "PHOTO" }, usage: uploadUsage(session) }),
    });
  });
}

function mockVoiceUpload(page: Page, status: number, body: Record<string, unknown>) {
  page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

function mockVoiceUploadSuccess(page: Page, session: ReturnType<typeof mockStatefulSession>) {
  page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
  page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
    session.addVoice();
    await route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
    });
  });
}

async function startSession(page: Page) {
  await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "QA Media Event" })).toBeVisible();
  await page.getByLabel(/Namamu/).fill("QA Tester");
  await page.getByRole("button", { name: "Mulai yuk" }).click();
  // Frame-selection step (DESIGN.md §5.2) sits between Start and the capture
  // screen. Default path through the suite: continue without a frame.
  await expect(page.getByRole("heading", { name: "Pilih Frame fotomu" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Tanpa Frame" }).click();
  // Post-Start shows the fullscreen capture screen.
  await expect(page.getByRole("heading", { name: "Jepret foto" })).toBeVisible({ timeout: 5000 });
}

// The Done screen marks arrival with the receipt copy (DESIGN.md §5.6): the
// h1 is sr-only and the thermal-print sequence holds content until phase 4
// (~8.5s after mount), so callers must allow a >9s timeout.
function doneHeading(page: Page) {
  return page.getByText("Terima kasih — foto dan pesan suara kamu sudah kami terima.");
}

// Voice note is a dedicated full-screen step AFTER photo review (DESIGN.md
// §5.5): capture one photo, advance to review, sync via "Simpan & Lanjut",
// then the voice screen mounts.
async function captureOnePhoto(page: Page) {
  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  await fileInput.setInputFiles({ name: "test-photo.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
}

async function advanceToVoiceScreen(page: Page) {
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await expect(page.getByRole("heading", { name: /^Foto Pilihanmu \(\d+\/5\)$/ })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" }).click();
  await expect(page.getByRole("heading", { name: "Tinggalkan Pesan Suara" })).toBeVisible({ timeout: 5000 });
}

// Photo-review CTA: syncs pending photos, then advances to the voice screen.
// The sync-then-advance race in guest-event-entry.tsx was fixed (2026-08-20):
// a single CTA click syncs pending photos and the deferred advance effect
// fires once the sync state commits. Reaching the voice screen proves every
// item was server-confirmed (the CTA only advances when all confirmed).
async function syncReviewToVoice(page: Page) {
  await page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" }).click();
}

async function recordAndStop(page: Page, durationMs = 6000) {
  await page.getByRole("button", { name: "Mulai rekam pesan suara" }).click();
  await expect(page.getByText("Merekam", { exact: true })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(durationMs);
  await page.getByRole("button", { name: "Hentikan rekaman" }).click();
  // Review state: DM Mono duration chip ("N detik").
  await expect(page.getByText(/^\d+ detik$/)).toBeVisible({ timeout: 5000 });
}

// --- Tests ---

test.describe("Frame selection (9:16 standard, DESIGN.md §5.2)", () => {
  test.beforeEach(async ({ page }) => {
    mockEventApi(page);
  });

  test("frame cards render at the 9:16 ratio with selectable previews", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mulai yuk" }).click();

    await expect(page.getByRole("heading", { name: "Pilih Frame fotomu" })).toBeVisible({ timeout: 5000 });
    const group = page.getByRole("radiogroup");
    await expect(group).toBeVisible();

    // Every real frame card shows its preview image (9:16 container,
    // object-contain so the art is never distorted).
    const cards = group.getByRole("radio");
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const box = await cards.nth(i).locator("div.aspect-\\[9\\/16\\]").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width / box!.height).toBeCloseTo(9 / 16, 2);
      await expect(cards.nth(i).locator("img[aria-hidden='true']")).toBeVisible();
    }

    // Selecting a frame flips aria-checked and the confirm button label.
    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Pilih Wedding Crimson" })).toBeVisible();

    // The chosen frame is printed onto captures: the fullscreen viewfinder
    // shows the overlay and the confirm leads to the capture screen.
    await page.getByRole("button", { name: "Pilih Wedding Crimson" }).click();
    await expect(page.getByRole("heading", { name: "Jepret foto" })).toBeVisible({ timeout: 5000 });
      const video = page.locator("video[aria-label='Pratinjau kamera']");
    await expect(video).toBeVisible({ timeout: 5000 });
    // The camera viewport is the bounded 9:16 photobooth box (DESIGN.md §5.3,
    // owner-ratified 2026-08-21): the video fills the box, so its bounding
    // box must hold the single 9:16 standard (not the full viewport).
    const vbox = await video.boundingBox();
    expect(vbox!.width / vbox!.height).toBeCloseTo(9 / 16, 2);
    // Scoped to the 9:16 viewport box: the ambient blurred backdrop img also
    // matches the raw src, but it lives outside the box (DESIGN.md §5.3).
    await expect(page.locator("div.aspect-\\[9\\/16\\] img[src='/frames/wedding-crimson.png']")).toBeVisible();
  });

  test("keyboard navigation moves the selection with arrow keys", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mulai yuk" }).click();
    await expect(page.getByRole("heading", { name: "Pilih Frame fotomu" })).toBeVisible({ timeout: 5000 });

    const cards = page.getByRole("radiogroup").getByRole("radio");
    // Roving tabindex: first card is in tab order, others are not.
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(cards.nth(1)).toHaveAttribute("tabindex", "-1");

    // Arrow keys move selection + focus through the 4 cards.
    await cards.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(cards.nth(3)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(cards.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(cards.nth(1)).toBeFocused();
    // Wrap-around: from the first card ArrowUp wraps to the last (index 3).
    await cards.nth(0).focus();
    await page.keyboard.press("ArrowUp");
    await expect(cards.nth(3)).toBeFocused();
    await expect(cards.nth(3)).toHaveAttribute("aria-checked", "true");
  });

  test("capture with a frame produces a 1080×1920 JPEG", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mulai yuk" }).click();
    await expect(page.getByRole("heading", { name: "Pilih Frame fotomu" })).toBeVisible({ timeout: 5000 });

    // Select a real frame and enter the capture screen.
    await page.getByRole("radio").nth(0).click();
    await page.getByRole("button", { name: "Pilih Wedding Crimson" }).click();
    await expect(page.getByRole("heading", { name: "Jepret foto" })).toBeVisible({ timeout: 5000 });

    // The fake media device provides a 1280×720 landscape feed: the capture
    // must still composite to the fixed 1080×1920 output.
    const shutter = page.getByRole("button", { name: "Jepret foto" });
    await expect(shutter).toBeVisible({ timeout: 5000 });
    await shutter.click();
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 5000 });

    // Read the pending capture from the in-page blob and decode its JPEG
    // dimensions — must be exactly the 1080×1920 standard.
    const dims = await page.evaluate(() =>
      new Promise<{ w: number; h: number; type: string }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, type: "ok" });
        img.onerror = () => resolve({ w: 0, h: 0, type: "error" });
        img.src = (document.querySelector("button[aria-label^='Foto 1'] img") as HTMLImageElement).src;
      }),
    );
    expect(dims.type).toBe("ok");
    expect(dims.w).toBe(1080);
    expect(dims.h).toBe(1920);
  });
});

test.describe("Mobile-media QA", () => {
  test.beforeEach(async ({ page }) => {
    mockEventApi(page);
  });

  // 1. PHOTO FLOW: file selection, pending strip, sync from photo-review,
  //    voice screen, skip → done (photos-only finish is valid via skip).
  test("photo: file selection, pending strip, sync via photo-review, skip voice, advance to done", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);

    await startSession(page);
    await expect(page.getByRole("heading", { name: "Jepret foto" })).toBeVisible();

    // Choose file via fallback picker.
    await captureOnePhoto(page);

    // Pending strip shows the captured photo; "Lanjut →" advances to review.
    await page.getByRole("button", { name: "Lanjut →" }).click();

    // Photo-review: CTA syncs pending photos, then advances to voice-note.
    await expect(page.getByRole("heading", { name: /^Foto Pilihanmu \(\d+\/5\)$/ })).toBeVisible({ timeout: 5000 });
    await syncReviewToVoice(page);

    // Sync success is proven by the advance to the voice screen (the CTA only
    // advances once every remaining item is server-confirmed).
    await expect(page.getByRole("heading", { name: "Tinggalkan Pesan Suara" })).toBeVisible({ timeout: 5000 });
    expect(session.getPhotos()).toBe(1);

    // Photos-only finish: skip voice → done.
    await page.getByRole("button", { name: "Lewati — Selesai & Kirim Foto Saja" }).click();
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });
    expect(session.getVoice()).toBe(false);
  });

  // 1a. VOICE SKIP: skip link on the voice screen completes the flow to done
  //     without a voice upload.
  test("voice: skip from the voice screen completes the flow to done", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await page.getByRole("button", { name: "Lewati — Selesai & Kirim Foto Saja" }).click();
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });
    // No voice note was submitted; the voice screen is gone.
    expect(session.getVoice()).toBe(false);
    await expect(page.getByRole("heading", { name: "Tinggalkan Pesan Suara" })).toHaveCount(0);
  });

  // 2. PHOTO ERROR: sync failure on photo-review → item-level error + retry
  test("photo: upload error on photo-review shows item-level error with retry", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 422, { error: { code: "UNSUPPORTED_MEDIA", message: "Unsupported image format." } });

    await startSession(page);
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });

    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Pilihanmu \(\d+\/5\)$/ })).toBeVisible({ timeout: 5000 });

    // CTA triggers the sync; the 422 leaves the item in error state on review.
    await page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" }).click();

    // Error alert with retry-or-delete guidance.
    await expect(page.getByText("1 foto belum tersimpan. Ketuk ikon putar atau hapus sebelum lanjut.")).toBeVisible({ timeout: 5000 });

    // CTA blocked while unresolved errors remain (nothing left to send).
    await expect(page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" })).toBeDisabled();

    // Retry → item back to pending → CTA unblocked.
    await page.getByRole("button", { name: /Kirim ulang foto 1/ }).click();
    await expect(page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" })).toBeEnabled({ timeout: 5000 });
  });

  // 3. PHOTO LIMIT
  test("photo: limit reached disables capture and shows message", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page, { photos: 5 });
    await startSession(page);
    // DM Mono frame counter reflects the exhausted budget (local hint).
    await expect(page.getByText("0 / 5")).toBeVisible();
    await expect(page.getByText("Batas foto untuk sesi ini sudah terpakai.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jepret foto" })).toBeDisabled();
  });

  // 4. VOICE: photo sync → voice screen → permission → record → stop →
  //    review → submit → done
  test("voice: dedicated screen, recording, stop, review, submit success", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUploadSuccess(page, session);

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await expect(page.getByText("Ketuk mikrofon untuk mulai berbicara.")).toBeVisible();

    // Record. (The "Allow microphone access" hint is transient — replaced by
    // "Merekam" the moment the granted fake permission resolves — so only
    // the stable recording state is asserted.)
    await page.getByRole("button", { name: "Mulai rekam pesan suara" }).click();
    await expect(page.getByText("Merekam", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Hentikan rekaman" })).toBeVisible();
    // DM Mono elapsed timer (00:00 / 00:30).
    await expect(page.getByText(/\/ 00:30/)).toBeVisible();

    // Stop. Record ≥5s: the client blocks submit for shorter takes, and this
    // test submits, so keep the take above the 5s floor.
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: "Hentikan rekaman" }).click();

    // Review state.
    await expect(page.getByText(/^\d+ detik$/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Putar pesan suara" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kirim Pesan Suara →" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rekam Ulang" })).toBeVisible();

    // Submit → done.
    await page.getByRole("button", { name: "Kirim Pesan Suara →" }).click();
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });
    expect(session.getVoice()).toBe(true);
  });

  // 4a. VOICE REGRESSION: a 201 POST must re-fetch the session via the
  // contracted GET shape. This catches GET /session responses that omit
  // contracted usage fields: confirmUsage() then rejects the body and
  // silently keeps stale state.
  test("voice regression: POST 201 re-fetches full session shape before done", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    let voicePosts = 0;
    let sessionGets = 0;
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      voicePosts++;
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
      });
    });
    mockPhotoUploadSuccess(page, session);
    page.unroute(`**/api/events/${EVENT_ID}/session`);
    page.route(`**/api/events/${EVENT_ID}/session`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ session: { guest_name: "QA Tester", photos_submitted: 0, photos_remaining: 5, voice_note_submitted: false, voice_note_available: true } }) });
      } else {
        sessionGets++;
        await route.fulfill({
          status: 200, contentType: "application/json",
          // Full contracted usage shape (API Contract §4/§6.3).
          body: JSON.stringify({
            guest_name: "QA Tester",
            photos_submitted: session.getPhotos(),
            photos_remaining: 5 - session.getPhotos(),
            voice_note_submitted: session.getVoice(),
            voice_note_available: !session.getVoice(),
            event: { title: "QA Media Event", status: "ACTIVE" },
          }),
        });
      }
    });

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await recordAndStop(page, 6000);
    await page.getByRole("button", { name: "Kirim Pesan Suara →" }).click();

    // The flow may complete only after the re-fetch carries the full shape.
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });
    expect(voicePosts).toBe(1);
    expect(sessionGets).toBeGreaterThan(0);
  });

  // 5. VOICE: auto-stop at 30s
  test("voice: auto-stop at 30 seconds", async ({ page, context }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUploadSuccess(page, session);

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await page.getByRole("button", { name: "Mulai rekam pesan suara" }).click();
    await expect(page.getByText("Merekam", { exact: true })).toBeVisible({ timeout: 5000 });

    // Auto-stop at 30s. Timer: at seconds>=29, finishRecording() + return 30.
    await expect(page.getByText("30 detik")).toBeVisible({ timeout: 35000 });
  });

  // 6. VOICE: re-record replaces unsent take
  test("voice: re-record replaces unsent take", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUploadSuccess(page, session);

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await recordAndStop(page, 6000);

    // Re-record.
    await expect(page.getByRole("button", { name: "Rekam Ulang" })).toBeVisible();
    await page.getByRole("button", { name: "Rekam Ulang" }).click();
    await expect(page.getByRole("button", { name: "Mulai rekam pesan suara" })).toBeVisible({ timeout: 3000 });

    // Record again + submit → done.
    await recordAndStop(page, 6000);
    await expect(page.getByRole("button", { name: "Kirim Pesan Suara →" })).toBeVisible();
    await page.getByRole("button", { name: "Kirim Pesan Suara →" }).click();
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });
  });

  // 7. VOICE: upload error retains review UI (D1 fix)
  test("voice: upload error retains audio, duration, Re-record, and Submit", async ({ page, context }) => {
    // D1 FIX: On upload error, voiceState goes to "review-error" which renders
    // the review branch — retaining audio playback, duration, Re-record, and
    // Submit buttons alongside the error message.
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUpload(page, 422, { error: { code: "AUDIO_DURATION_INVALID", message: "Voice note must be between 5 and 30 seconds." } });

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);
    await recordAndStop(page, 6000);
    await page.getByRole("button", { name: "Kirim Pesan Suara →" }).click();

    // Error message shown.
    await expect(page.getByText("Pesan suara harus 5–30 detik. Rekam ulang di rentang itu.")).toBeVisible({ timeout: 5000 });

    // Audio playback retained.
    await expect(page.getByRole("button", { name: "Putar pesan suara" })).toBeVisible();

    // Duration retained.
    await expect(page.getByText(/^\d+ detik$/)).toBeVisible();

    // Re-record button available.
    await expect(page.getByRole("button", { name: "Rekam Ulang" })).toBeVisible();

    // Submit (retry) button available.
    await expect(page.getByRole("button", { name: "Kirim Pesan Suara →" })).toBeVisible();

    // "Record" (idle) button NOT shown — we're still in review-error, not idle.
    await expect(page.getByRole("button", { name: "Mulai rekam pesan suara" })).toHaveCount(0);
  });

  // 8. CLOSED event
  test("closed event: submission actions disabled", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Override event to CLOSED before navigation.
    await page.unroute(`**/api/events/${EVENT_ID}`);
    await page.route(`**/api/events/${EVENT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ event: { title: "QA Media Event", status: "CLOSED" } }) });
    });

    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });

    await expect(page.getByText("Acaranya sudah selesai, jadi foto dan pesan baru nggak bisa dikirim lagi.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mulai yuk" })).toBeDisabled();
  });

  // 9. SESSION USAGE: the capture counter reflects the local budget hint and
  //    voice submit re-syncs usage server-side before done. (Sequential flow:
  //    photos sync on the review screen first, then the voice screen submits
  //    and re-fetches usage before done.)
  test("session usage: counter hint plus voice submit usage re-sync", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUploadSuccess(page, session);

    await startSession(page);
    // Initial counter: full budget.
    await expect(page.getByText("5 / 5")).toBeVisible();

    // Capture a photo (pending): the local budget hint decrements.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "test.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("4 / 5")).toBeVisible();

    // Review syncs the pending photo, then the voice screen submits and
    // re-fetches usage before done.
    await advanceToVoiceScreen(page);
    expect(session.getPhotos()).toBe(1);
    await recordAndStop(page, 6000);
    await page.getByRole("button", { name: "Kirim Pesan Suara →" }).click();
    await expect(doneHeading(page)).toBeVisible({ timeout: 12000 });

    expect(session.getVoice()).toBe(true);
  });

  // 10. VOICE: onstop uses actual elapsed duration for hint (D2 fix)
  test("voice: onstop hint uses actual duration, not stale closure (D2 fix)", async ({ page, context }) => {
    // D2 FIX: recorder.onstop now reads voiceSecondsRef.current instead of
    // the stale voiceSeconds closure (always 0 at record start). Recording
    // for >5s should NOT show the "Too short" hint.
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUpload(page, 201, { submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: 0, photos_remaining: 5, voice_note_submitted: true, voice_note_available: false } });

    await startSession(page);
    await captureOnePhoto(page);
    await advanceToVoiceScreen(page);

    // Record for ~6 seconds (above the 5s threshold).
    await page.getByRole("button", { name: "Mulai rekam pesan suara" }).click();
    await expect(page.getByText("Merekam", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: "Hentikan rekaman" }).click();

    await expect(page.getByText(/^\d+ detik$/)).toBeVisible({ timeout: 5000 });

    // Duration display correct (~6s).
    const durationText = await page.getByText(/^\d+ detik$/).textContent();
    expect(durationText).not.toContain("0 detik");

    // "Too short" hint should NOT show (6s >= 5s).
    await expect(page.getByText("Durasi terlalu singkat")).toHaveCount(0);

    // "Minimum 5 detik" guidance should NOT show.
    await expect(page.getByText("Pesan suara minimal 5 detik agar dapat disimpan. Silakan rekam ulang.")).toHaveCount(0);
  });

  // 11. PHOTO: multiple captures before sync (batch via photo-review)
  test("photo: multiple captures then batch sync", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    let uploadCount = 0;
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      uploadCount++;
      session.addPhoto();
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: `p${uploadCount}`, type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);

    // Capture 2 photos via file picker.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
    await fileInput.setInputFiles({ name: "photo2.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 2/ })).toBeVisible({ timeout: 3000 });

    // Advance to review and sync both.
    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Pilihanmu \(\d+\/5\)$/ })).toBeVisible({ timeout: 5000 });
    await syncReviewToVoice(page);

    // Both saved: CTA only advances once every item is confirmed.
    await expect(page.getByRole("heading", { name: "Tinggalkan Pesan Suara" })).toBeVisible({ timeout: 5000 });
    expect(uploadCount).toBe(2);
    expect(session.getPhotos()).toBe(2);
  });

  // 12. PHOTO: delete pending photo before sync (capture review overlay)
  test("photo: delete pending photo frees budget", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 201, { submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: 1, photos_remaining: 4, voice_note_submitted: false, voice_note_available: true } });

    await startSession(page);

    // Capture a photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });

    // Open review overlay and delete.
    await page.getByRole("button", { name: /Foto 1/ }).click();
    await expect(page.getByRole("dialog", { name: "Tinjau foto" })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Hapus" }).click();

    // Pending strip empty → no advance button and no photo thumbnails.
    await expect(page.getByRole("button", { name: /Foto 1/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lanjut →" })).toHaveCount(0);
  });

  // 13. PHOTO RETAKE: retake removes unsent photo, restores budget, no upload
  test("photo: retake removes unsent photo, restores budget, no upload", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    let photoPosts = 0;
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      photoPosts++;
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: 1, photos_remaining: 4, voice_note_submitted: false, voice_note_available: true } }),
      });
    });

    await startSession(page);
    await expect(page.getByText("5 / 5")).toBeVisible();

    // Capture a photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("4 / 5")).toBeVisible();

    // Open review and Retake.
    await page.getByRole("button", { name: /Foto 1/ }).click();
    const dialog = page.getByRole("dialog", { name: "Tinjau foto" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await dialog.getByRole("button", { name: "Ulangi" }).click();

    // Dialog closed, strip empty, no advance button, budget restored.
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Foto 1/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lanjut →" })).toHaveCount(0);
    await expect(page.getByText("5 / 5")).toBeVisible();

    // No upload happened.
    expect(photoPosts).toBe(0);
  });

  // 14. PHOTO REVIEW: during the review-screen sync, in-flight/confirmed
  //     items cannot be deleted or retried and the CTA stays blocked.
  test("photo: confirmed/in-flight items during review sync have no delete/retry", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    let reqCount = 0;
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      reqCount++;
      session.addPhoto();
      // Slow the sync so the review screen renders in-flight/confirmed items.
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: `p${reqCount}`, type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);

    // Capture 2 photos.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 1/ })).toBeVisible({ timeout: 3000 });
    await fileInput.setInputFiles({ name: "photo2.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Foto 2/ })).toBeVisible({ timeout: 3000 });

    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Pilihanmu \(\d+\/5\)$/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Simpan & Lanjut ke Pesan Suara →" }).click();

    // CTA blocked while syncing.
    await expect(page.getByRole("button", { name: "Mengirim foto…" })).toBeVisible({ timeout: 3000 });

    // No delete/retry on in-flight or confirmed items during the sync.
    await expect(page.getByRole("button", { name: "Hapus foto 1" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Hapus foto 2" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Kirim ulang foto \d/ })).toHaveCount(0);

    // Sync completes → the deferred advance moves to the voice screen.
    await expect(page.getByRole("heading", { name: "Tinggalkan Pesan Suara" })).toBeVisible({ timeout: 5000 });
    expect(reqCount).toBe(2);
  });
});
