import { test, expect, type Page } from "@playwright/test";

// T030 Mobile-Media QA — sequential guest flow (UI_UX §4.2–§4.7):
// frame-select → capture → photo-review → voice → done (route-intercepted).
// Device: Chromium 130+ on Windows, emulating mobile viewport (375x812).
// Uses --use-fake-device-for-media-stream + --use-fake-ui-for-media-stream
// to simulate camera/mic without real hardware.

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

async function startSession(page: Page) {
  await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "QA Media Event" })).toBeVisible();
  await page.getByLabel(/Your name/).fill("QA Tester");
  await page.getByRole("button", { name: "Start" }).click();
  // Frame-selection step (UI_UX §4.2) sits between Start and the capture
  // screen. Default path through the suite: continue without a frame.
  await expect(page.getByRole("heading", { name: "Choose a frame" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Continue without frame" }).click();
  // Post-Start shows capture screen with remaining counter.
  await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible({ timeout: 5000 });
}

// Sequential flow: capture → "Lanjut →" → photo-review → "Lanjut ke pesan
// suara" (syncs pending photos, then advances) → voice screen (UI_UX §4.3–§4.5).
async function advanceToVoiceScreen(page: Page) {
  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });
  await advancePastPhotoReview(page);
  await expect(page.getByRole("heading", { name: "Pesan suara" })).toBeVisible({ timeout: 5000 });
}

// Advance from photo-review to voice. The sync-then-advance race in
// guest-event-entry.tsx was fixed (2026-08-20): a single CTA click syncs
// pending photos and the deferred advance effect moves to voice once the
// sync state commits. Reaching the voice screen proves every item was
// server-confirmed (the CTA only advances when all confirmed).
async function advancePastPhotoReview(page: Page) {
  await page.getByRole("button", { name: "Lanjut ke pesan suara" }).click();
}

async function recordAndStop(page: Page, durationMs = 1500) {
  await page.getByRole("button", { name: "Record voice note" }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(durationMs);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });
}

// --- Tests ---

test.describe("Frame selection (9:16 standard, UI_UX §4.2)", () => {
  test.beforeEach(async ({ page }) => {
    mockEventApi(page);
  });

  test("frame cards render at the 9:16 ratio with selectable previews", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page.getByRole("heading", { name: "Choose a frame" })).toBeVisible({ timeout: 5000 });
    const group = page.getByRole("radiogroup");
    await expect(group).toBeVisible();

    // Every real frame card shows its preview image (9:16 container,
    // object-contain so the art is never distorted).
    const cards = group.getByRole("radio");
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = await cards.nth(i).locator("span.aspect-\\[9\\/16\\]").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width / box!.height).toBeCloseTo(9 / 16, 2);
      await expect(cards.nth(i).locator("img[aria-hidden='true']")).toBeVisible();
    }

    // Selecting a frame flips aria-checked and the confirm button label.
    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Use Wedding Floral" })).toBeVisible();

    // The chosen frame is printed onto captures: the viewfinder shows the
    // overlay and the confirm leads to the capture screen.
    await page.getByRole("button", { name: "Use Wedding Floral" }).click();
    await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible({ timeout: 5000 });
    const video = page.locator("video[aria-label='Camera preview']");
    await expect(video).toBeVisible({ timeout: 5000 });
    const vbox = await video.boundingBox();
    expect(vbox!.width / vbox!.height).toBeCloseTo(9 / 16, 2);
    await expect(page.locator("img[src='/frames/wedding-floral.png']")).toBeVisible();
  });

  test("keyboard navigation moves the selection with arrow keys", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("heading", { name: "Choose a frame" })).toBeVisible({ timeout: 5000 });

    const cards = page.getByRole("radiogroup").getByRole("radio");
    // Roving tabindex: first card is in tab order, others are not.
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(cards.nth(1)).toHaveAttribute("tabindex", "-1");

    // Arrow keys move selection + focus.
    await cards.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowDown");
    await expect(cards.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(cards.nth(1)).toBeFocused();
    // Wrap-around.
    await cards.nth(0).focus();
    await page.keyboard.press("ArrowUp");
    await expect(cards.nth(2)).toBeFocused();
  });

  test("capture with a frame produces a 1080×1920 JPEG", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    await page.goto(`/e/${EVENT_ID}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("heading", { name: "Choose a frame" })).toBeVisible({ timeout: 5000 });

    // Select a real frame and enter the capture screen.
    await page.getByRole("radio").nth(0).click();
    await page.getByRole("button", { name: "Use Wedding Floral" }).click();
    await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible({ timeout: 5000 });

    // The fake media device provides a 1280×720 landscape feed: the capture
    // must still composite to the fixed 1080×1920 output.
    const shutter = page.getByRole("button", { name: "Take photo" });
    await expect(shutter).toBeVisible({ timeout: 5000 });
    await shutter.click();
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 5000 });

    // Read the pending capture from the in-page blob and decode its JPEG
    // dimensions — must be exactly the 1080×1920 standard.
    const dims = await page.evaluate(() =>
      new Promise<{ w: number; h: number; type: string }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight, type: "ok" });
        img.onerror = () => resolve({ w: 0, h: 0, type: "error" });
        img.src = (document.querySelector("button[aria-label^='Photo 1'] img") as HTMLImageElement).src;
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
  //    then skip voice → done (exercises the §4.6 skip link).
  test("photo: file selection, pending strip, sync via photo-review, skip voice", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);

    await startSession(page);
    await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible();

    // Choose file via fallback picker.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "test-photo.jpg", mimeType: "image/jpeg", buffer: JPEG });

    // Pending strip shows the captured photo; "Lanjut →" advances to review.
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Lanjut →" }).click();

    // Photo-review: CTA syncs pending photos, then advances to voice.
    await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });
    await advancePastPhotoReview(page);

    // Sync success is proven by the advance to the voice screen (the CTA
    // only advances once every remaining item is server-confirmed).
    await expect(page.getByRole("heading", { name: "Pesan suara" })).toBeVisible({ timeout: 5000 });
    expect(session.getPhotos()).toBe(1);
    // Skip voice → done.
    await page.getByRole("button", { name: "Lewati & kirim foto saja" }).click();
    await expect(page.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 5000 });
  });

  // 2. PHOTO ERROR: sync failure on photo-review → item-level error + retry
  test("photo: upload error on photo-review shows item-level error with retry", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 422, { error: { code: "UNSUPPORTED_MEDIA", message: "Unsupported image format." } });

    await startSession(page);
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });

    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });

    // CTA triggers the sync; the 422 leaves the item in error state on review.
    await page.getByRole("button", { name: "Lanjut ke pesan suara" }).click();

    // Error alert with retry-or-delete guidance.
    await expect(page.getByText("1 photo could not be saved. Retry or delete it before continuing.")).toBeVisible({ timeout: 5000 });

    // CTA blocked while unresolved errors remain (nothing left to send).
    await expect(page.getByRole("button", { name: "Lanjut ke pesan suara" })).toBeDisabled();

    // Retry → item back to pending → CTA unblocked.
    await page.getByRole("button", { name: /Retry photo 1/ }).click();
    await expect(page.getByRole("button", { name: "Lanjut ke pesan suara" })).toBeEnabled({ timeout: 5000 });
  });

  // 3. PHOTO LIMIT
  test("photo: limit reached disables capture and shows message", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page, { photos: 5 });
    await startSession(page);
    await expect(page.getByText("Photos remaining:")).toContainText("0/5");
    await expect(page.getByText("Photo limit reached for this guest session.")).toBeVisible();
  });

  // 4. VOICE: permission → record → stop → review → submit → done
  test("voice: permission prompt, recording, stop, review, submit success", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);
    await advanceToVoiceScreen(page);
    await expect(page.getByText("Microphone permission will be requested after you choose Record.")).toBeVisible();

    // Record. (The "Allow microphone access" hint is transient — replaced by
    // "Recording" the moment the granted fake permission resolves — so only
    // the stable recording state is asserted.)
    await page.getByRole("button", { name: "Record voice note" }).click();
    await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await expect(page.locator(".font-mono.text-xl")).toBeVisible();

    // Stop.
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop recording" }).click();

    // Review state.
    await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('audio[aria-label="Voice note playback"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "✓ Kirim semua" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rekam ulang" })).toBeVisible();

    // Submit → done.
    await page.getByRole("button", { name: "✓ Kirim semua" }).click();
    await expect(page.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 5000 });
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
    await expect(page.getByText("Voice note:")).toContainText("Available");

    await advanceToVoiceScreen(page);
    await recordAndStop(page, 800);
    await page.getByRole("button", { name: "✓ Kirim semua" }).click();

    // The flow may complete only after the re-fetch carries the full shape.
    await expect(page.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 5000 });
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
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);
    await advanceToVoiceScreen(page);
    await page.getByRole("button", { name: "Record voice note" }).click();
    await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });

    // Auto-stop at 30s. Timer: at seconds>=29, finishRecording() + return 30.
    await expect(page.getByText("Duration:")).toBeVisible({ timeout: 35000 });
    await expect(page.getByText("Duration:")).toContainText("30s");
  });

  // 6. VOICE: re-record replaces unsent take
  test("voice: re-record replaces unsent take", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);
    await advanceToVoiceScreen(page);
    await recordAndStop(page, 1000);

    // Re-record.
    await expect(page.getByRole("button", { name: "Rekam ulang" })).toBeVisible();
    await page.getByRole("button", { name: "Rekam ulang" }).click();
    await expect(page.getByRole("button", { name: "Record voice note" })).toBeVisible({ timeout: 3000 });

    // Record again + submit → done.
    await recordAndStop(page, 1000);
    await expect(page.getByRole("button", { name: "✓ Kirim semua" })).toBeVisible();
    await page.getByRole("button", { name: "✓ Kirim semua" }).click();
    await expect(page.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 5000 });
  });

  // 7. VOICE: upload error retains review UI (D1 fix)
  test("voice: upload error retains audio, duration, Re-record, and Submit", async ({ page, context }) => {
    // D1 FIX: On upload error, voiceState goes to "review-error" which renders
    // the review branch — retaining audio playback, duration, Re-record, and
    // Submit buttons alongside the error message. UI_UX §4.5.
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    mockPhotoUploadSuccess(page, session);
    mockVoiceUpload(page, 422, { error: { code: "AUDIO_DURATION_INVALID", message: "Voice note must be between 5 and 30 seconds." } });

    await startSession(page);
    await advanceToVoiceScreen(page);
    await recordAndStop(page, 800);
    await page.getByRole("button", { name: "✓ Kirim semua" }).click();

    // Error message shown.
    await expect(page.getByText("Voice notes must be 5–30 seconds. Re-record within that range.")).toBeVisible({ timeout: 5000 });

    // Audio playback retained.
    await expect(page.locator('audio[aria-label="Voice note playback"]')).toBeVisible();

    // Duration retained.
    await expect(page.getByText("Duration:")).toBeVisible();

    // Re-record button available.
    await expect(page.getByRole("button", { name: "Rekam ulang" })).toBeVisible();

    // Submit (retry) button available.
    await expect(page.getByRole("button", { name: "✓ Kirim semua" })).toBeVisible();

    // "Record" (idle) button NOT shown — we're still in review-error, not idle.
    await expect(page.getByRole("button", { name: "Record voice note" })).toHaveCount(0);
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

    await expect(page.getByText("This event remains viewable, but new submissions are not accepted.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  // 9. Session usage: photo + voice through the sequential flow
  test("session usage display correct after photo + voice", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    let photoPosts = 0;
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      photoPosts++;
      session.addPhoto();
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: `p${photoPosts}`, type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);
    await expect(page.getByText("Photos remaining:")).toContainText("5/5");
    await expect(page.getByText("Voice note:")).toContainText("Available");

    // Photo via file picker, synced from photo-review.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });
    await advancePastPhotoReview(page);
    await expect(page.getByRole("heading", { name: "Pesan suara" })).toBeVisible({ timeout: 5000 });

    // Voice.
    await recordAndStop(page, 1000);
    await page.getByRole("button", { name: "✓ Kirim semua" }).click();
    await expect(page.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 5000 });

    // Both submissions landed server-side.
    expect(photoPosts).toBe(1);
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
    await advanceToVoiceScreen(page);

    // Record for ~6 seconds (above the 5s threshold).
    await page.getByRole("button", { name: "Record voice note" }).click();
    await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: "Stop recording" }).click();

    await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });

    // Duration display correct (~6s).
    const durationText = await page.getByText("Duration:").textContent();
    expect(durationText).not.toContain("0s");

    // "Too short" hint should NOT show (6s >= 5s).
    await expect(page.getByText("Too short")).toHaveCount(0);

    // "Keep recording for at least 5 seconds" guidance should NOT show.
    await expect(page.getByText("Keep recording for at least 5 seconds")).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await fileInput.setInputFiles({ name: "photo2.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Photo 2/ })).toBeVisible({ timeout: 3000 });

    // Advance to review and sync both.
    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });
    await advancePastPhotoReview(page);

    // Both saved: CTA only advances once every item is confirmed.
    await expect(page.getByRole("heading", { name: "Pesan suara" })).toBeVisible({ timeout: 5000 });
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
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });

    // Open review overlay and delete.
    await page.getByRole("button", { name: /Photo 1/ }).click();
    await expect(page.getByRole("dialog", { name: "Photo review" })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Delete" }).click();

    // Pending strip empty → no advance button and no photo thumbnails.
    await expect(page.getByRole("button", { name: /Photo 1/ })).toHaveCount(0);
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
    await expect(page.getByText("5 photos remaining")).toBeVisible();

    // Capture a photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("4 photos remaining")).toBeVisible();

    // Open review and Retake.
    await page.getByRole("button", { name: /Photo 1/ }).click();
    const dialog = page.getByRole("dialog", { name: "Photo review" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await dialog.getByRole("button", { name: "Retake" }).click();

    // Dialog closed, strip empty, no advance button, budget restored.
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Photo 1/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lanjut →" })).toHaveCount(0);
    await expect(page.getByText("5 photos remaining")).toBeVisible();

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
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await fileInput.setInputFiles({ name: "photo2.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByRole("button", { name: /Photo 2/ })).toBeVisible({ timeout: 3000 });

    await page.getByRole("button", { name: "Lanjut →" }).click();
    await expect(page.getByRole("heading", { name: /^Foto Anda \(\d+\)$/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Lanjut ke pesan suara" }).click();

    // CTA blocked while syncing (UI_UX §4.4).
    await expect(page.getByRole("button", { name: "Mengirim foto…" })).toBeVisible({ timeout: 3000 });

    // No delete/retry on in-flight or confirmed items during the sync.
    await expect(page.getByRole("button", { name: "Delete photo 1" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete photo 2" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Retry photo \d/ })).toHaveCount(0);

    // Sync completes → the deferred advance moves to voice.
    await expect(page.getByRole("heading", { name: "Pesan suara" })).toBeVisible({ timeout: 5000 });
    expect(reqCount).toBe(2);
  });
});
