import { test, expect, type Page } from "@playwright/test";

// T022 Mobile-Media QA — route-intercepted (no live backend).
// Device: Chromium 130+ on Windows, emulating mobile viewport (375x812).
// Uses --use-fake-device-for-media-stream + --use-fake-ui-for-media-stream
// to simulate camera/mic without real hardware.

const EVENT_ID = "qa-media-event";

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

  page.route(`**/api/events/${EVENT_ID}/session`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ session: { guest_name: "QA Tester", photos_submitted: photosSubmitted, photos_remaining: 5 - photosSubmitted, voice_note_submitted: voiceSubmitted, voice_note_available: !voiceSubmitted } }),
      });
    } else {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ guest_name: "QA Tester", photos_submitted: photosSubmitted, photos_remaining: 5 - photosSubmitted, voice_note_submitted: voiceSubmitted, voice_note_available: !voiceSubmitted, event: { title: "QA Media Event", status: eventStatus } }),
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

function mockPhotoUpload(page: Page, status: number, body: Record<string, unknown>) {
  page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
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
  await expect(page.getByText("Photos remaining:")).toBeVisible({ timeout: 5000 });
}

async function recordAndStop(page: Page, durationMs = 1500) {
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(durationMs);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });
}

// --- Tests ---

test.describe("Mobile-media QA", () => {
  test.beforeEach(async ({ page }) => {
    mockEventApi(page);
  });

  // 1. PHOTO FLOW
  test("photo: file selection, review, replace, upload success, usage update", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      session.addPhoto();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });

    await startSession(page);
    await expect(page.getByRole("heading", { name: "Add a photo" })).toBeVisible();

    // Choose file (nth(1) = "Choose a file").
    const fileInput = page.locator('input[type="file"][accept="image/*"]').nth(1);
    await fileInput.setInputFiles({ name: "test-photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]) });

    // Review state.
    await expect(page.getByText("Review your photo before saving.")).toBeVisible();
    await expect(page.getByAltText("Selected photo preview")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();

    // Replace: remove → re-select.
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Choose a photo.")).toBeVisible();
    await fileInput.setInputFiles({ name: "test-photo-2.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByAltText("Selected photo preview")).toBeVisible();

    // Submit.
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByText("Photo saved.")).toBeVisible({ timeout: 5000 });
    // Usage updated from server response.
    await expect(page.getByText("Photos remaining:")).toContainText("4/5", { timeout: 5000 });
  });

  // 2. PHOTO ERROR
  test("photo: upload error shows item-level error with retry", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 422, { error: { code: "UNSUPPORTED_MEDIA", message: "Unsupported image format." } });

    await startSession(page);
    const fileInput = page.locator('input[type="file"][accept="image/*"]').nth(1);
    await fileInput.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await page.getByRole("button", { name: "Save photo" }).click();

    await expect(page.getByText("This image format is not supported.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByAltText("Selected photo preview")).toBeVisible();
  });

  // 3. PHOTO LIMIT
  test("photo: limit reached disables photo action", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page, { photos: 5 });
    await startSession(page);
    await expect(page.getByText("Photos remaining:")).toContainText("0/5");
    await expect(page.getByText("Photo limit reached for this guest session.")).toBeVisible();
  });

  // 4. VOICE: permission → record → stop → review → upload → usage update
  test("voice: permission prompt, recording, stop, review, upload success", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });

    await startSession(page);
    await expect(page.getByRole("heading", { name: "Add a voice note" })).toBeVisible();
    await expect(page.getByText("Microphone permission will be requested after you choose Record.")).toBeVisible();

    // Record.
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText(/Allow microphone access/)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Recording")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await expect(page.locator(".font-mono.text-2xl")).toBeVisible();

    // Stop.
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop recording" }).click();

    // Review state.
    await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('audio[aria-label="Voice note playback"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit voice note" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-record" })).toBeVisible();

    // Submit.
    await page.getByRole("button", { name: "Submit voice note" }).click();

    // Success: voice note consumed → "Already added" in usage.
    await expect(page.getByText("Voice note:")).toContainText("Already added", { timeout: 5000 });
    await expect(page.getByText("Voice-note limit reached for this guest session.")).toBeVisible();
  });

  // 5. VOICE: auto-stop at 30s
  test("voice: auto-stop at 30 seconds", async ({ page, context }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });

    await startSession(page);
    await page.getByRole("button", { name: "Record" }).click();
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
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });

    await startSession(page);
    await recordAndStop(page, 1000);

    // Re-record.
    await expect(page.getByRole("button", { name: "Re-record" })).toBeVisible();
    await page.getByRole("button", { name: "Re-record" }).click();
    await expect(page.getByRole("button", { name: "Record" })).toBeVisible({ timeout: 3000 });

    // Record again + submit.
    await recordAndStop(page, 1000);
    await expect(page.getByRole("button", { name: "Submit voice note" })).toBeVisible();
    await page.getByRole("button", { name: "Submit voice note" }).click();

    // Success: voice consumed.
    await expect(page.getByText("Voice note:")).toContainText("Already added", { timeout: 5000 });
  });

  // 7. VOICE: upload error retains review UI (D1 fix)
  test("voice: upload error retains audio, duration, Re-record, and Submit", async ({ page, context }) => {
    // D1 FIX: On upload error, voiceState goes to "review-error" which renders
    // the review branch — retaining audio playback, duration, Re-record, and
    // Submit buttons alongside the error message. UI_UX §4.4.10.
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    mockStatefulSession(page);
    mockVoiceUpload(page, 422, { error: { code: "AUDIO_DURATION_INVALID", message: "Voice note must be between 5 and 30 seconds." } });

    await startSession(page);
    await recordAndStop(page, 800);
    await page.getByRole("button", { name: "Submit voice note" }).click();

    // Error message shown.
    await expect(page.getByText("Voice notes must be 5–30 seconds. Re-record within that range.")).toBeVisible({ timeout: 5000 });

    // Audio playback retained.
    await expect(page.locator('audio[aria-label="Voice note playback"]')).toBeVisible();

    // Duration retained.
    await expect(page.getByText("Duration:")).toBeVisible();

    // Re-record button available.
    await expect(page.getByRole("button", { name: "Re-record" })).toBeVisible();

    // Submit (retry) button available.
    await expect(page.getByRole("button", { name: "Submit voice note" })).toBeVisible();

    // "Record" (idle) button NOT shown — we're still in review-error, not idle.
    await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
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

  // 9. Session usage: photo + voice
  test("session usage display correct after photo + voice", async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    const session = mockStatefulSession(page);

    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      session.addPhoto();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });
    page.unroute(`**/api/events/${EVENT_ID}/voice-notes`);
    page.route(`**/api/events/${EVENT_ID}/voice-notes`, async (route) => {
      session.addVoice();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: session.getPhotos(), photos_remaining: 5 - session.getPhotos(), voice_note_submitted: session.getVoice(), voice_note_available: !session.getVoice() } }),
      });
    });

    await startSession(page);
    await expect(page.getByText("Photos remaining:")).toContainText("5/5");
    await expect(page.getByText("Voice note:")).toContainText("Available");

    // Photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]').nth(1);
    await fileInput.setInputFiles({ name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByText("Photo saved.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Photos remaining:")).toContainText("4/5", { timeout: 5000 });

    // Voice.
    await recordAndStop(page, 1000);
    await page.getByRole("button", { name: "Submit voice note" }).click();
    await expect(page.getByText("Voice note:")).toContainText("Already added", { timeout: 5000 });
  });

  // 10. VOICE: onstop uses actual elapsed duration for hint (D2 fix)
  test("voice: onstop hint uses actual duration, not stale closure (D2 fix)", async ({ page, context }) => {
    // D2 FIX: recorder.onstop now reads voiceSecondsRef.current instead of
    // the stale voiceSeconds closure (always 0 at record start). Recording
    // for >5s should NOT show the "Too short" hint.
    await page.setViewportSize({ width: 375, height: 812 });
    await context.grantPermissions(["microphone"]);
    mockStatefulSession(page);
    mockVoiceUpload(page, 201, { submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: 0, photos_remaining: 5, voice_note_submitted: true, voice_note_available: false } });

    await startSession(page);

    // Record for ~6 seconds (above the 5s threshold).
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("Recording", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: "Stop recording" }).click();

    await expect(page.getByText("Duration:")).toBeVisible({ timeout: 5000 });

    // Duration display correct (~6s).
    const durationText = await page.getByText("Duration:").textContent();
    console.log("DURATION TEXT:", durationText);
    expect(durationText).not.toContain("0s");

    // "Too short" hint should NOT show (6s >= 5s).
    await expect(page.getByText("Too short")).toHaveCount(0);

    // "Keep recording for at least 5 seconds" guidance should NOT show.
    await expect(page.getByText("Keep recording for at least 5 seconds")).toHaveCount(0);
  });
});
