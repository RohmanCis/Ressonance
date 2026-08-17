import { test, expect, type Page } from "@playwright/test";

// T030 Mobile-Media QA — camera-first capture flow (route-intercepted).
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

  // Usage shape must match API Contract §4/§6.3 (2026-08-17 amendment):
  // six fields including guest_message_submitted/available. The app
  // validates all six on GET; omitting any leaves the UI stale.
  const usage = () => ({
    guest_name: "QA Tester",
    photos_submitted: photosSubmitted,
    photos_remaining: 5 - photosSubmitted,
    voice_note_submitted: voiceSubmitted,
    voice_note_available: !voiceSubmitted,
    guest_message_submitted: false,
    guest_message_available: true,
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

// Contracted usage shape for upload-route mocks (API Contract §4/§6.4–§6.6):
// six fields including guest_message_*. The app's confirmUsage() validates
// all six; serving a partial shape here previously masked real state sync.
function uploadUsage(session: ReturnType<typeof mockStatefulSession>) {
  return {
    guest_name: "QA Tester",
    photos_submitted: session.getPhotos(),
    photos_remaining: 5 - session.getPhotos(),
    voice_note_submitted: session.getVoice(),
    voice_note_available: !session.getVoice(),
    guest_message_submitted: false,
    guest_message_available: true,
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
  // Frame-selection step (UI_UX §4.2) sits between Start and the capture
  // screen. Default path through the suite: continue without a frame.
  await expect(page.getByRole("heading", { name: "Choose a frame" })).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Continue without frame" }).click();
  // Post-Start shows capture screen with remaining counter.
  await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible({ timeout: 5000 });
}

async function recordAndStop(page: Page, durationMs = 1500) {
  await page.getByRole("button", { name: "Record" }).click();
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

  // 1. PHOTO FLOW: file selection, pending strip, sync, usage update
  test("photo: file selection, pending strip, sync success, usage update", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      session.addPhoto();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);
    await expect(page.getByRole("heading", { name: "Take photos" })).toBeVisible();

    // Choose file via fallback picker.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "test-photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]) });

    // Pending strip shows the captured photo.
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });

    // Send (sync) button appears.
    await expect(page.getByRole("button", { name: /Send 1 photo/ })).toBeVisible();
    await page.getByRole("button", { name: /Send 1 photo/ }).click();

    // Success: usage updated from server response.
    await expect(page.getByText("1 photo saved.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Photos remaining:")).toContainText("4/5", { timeout: 5000 });
  });

  // 2. PHOTO ERROR
  test("photo: upload error shows item-level error with retry", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 422, { error: { code: "UNSUPPORTED_MEDIA", message: "Unsupported image format." } });

    await startSession(page);
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });

    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: /Send 1 photo/ }).click();

    // Error shows in sync summary or review.
    await expect(page.getByText(/could not be saved|not supported/i)).toBeVisible({ timeout: 5000 });
  });

  // 3. PHOTO LIMIT
  test("photo: limit reached disables capture and shows message", async ({ page }) => {
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
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
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

  // 4a. VOICE REGRESSION: a 201 POST must flip the usage UI via the session
  // re-fetch. This catches GET /session responses that omit contracted usage
  // fields (e.g. guest_message_*): confirmUsage() then rejects the body and
  // silently keeps stale state, leaving "Voice note: Available" on screen.
  test("voice regression: POST 201 flips usage UI to Already added (GET shape)", async ({ page, context }) => {
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
    page.unroute(`**/api/events/${EVENT_ID}/session`);
    page.route(`**/api/events/${EVENT_ID}/session`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ session: { guest_name: "QA Tester", photos_submitted: 0, photos_remaining: 5, voice_note_submitted: false, voice_note_available: true, guest_message_submitted: false, guest_message_available: true } }) });
      } else {
        sessionGets++;
        await route.fulfill({
          status: 200, contentType: "application/json",
          // Full contracted usage shape (API Contract §4/§6.3, 2026-08-17).
          body: JSON.stringify({
            guest_name: "QA Tester",
            photos_submitted: session.getPhotos(),
            photos_remaining: 5 - session.getPhotos(),
            voice_note_submitted: session.getVoice(),
            voice_note_available: !session.getVoice(),
            guest_message_submitted: false,
            guest_message_available: true,
            event: { title: "QA Media Event", status: "ACTIVE" },
          }),
        });
      }
    });

    await startSession(page);
    await expect(page.getByText("Voice note:")).toContainText("Available");

    await recordAndStop(page, 800);
    await page.getByRole("button", { name: "Submit voice note" }).click();

    // The UI must flip only because the GET response carries the full shape.
    await expect(page.getByText("Voice note:")).toContainText("Already added", { timeout: 5000 });
    expect(voicePosts).toBe(1);
    expect(sessionGets).toBeGreaterThan(0);
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
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
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
        body: JSON.stringify({ submission: { id: "v1", type: "VOICE_NOTE" }, usage: uploadUsage(session) }),
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
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: uploadUsage(session) }),
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

    // Photo via file picker.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "test.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
    await page.getByRole("button", { name: /Send 1 photo/ }).click();
    await expect(page.getByText("1 photo saved.")).toBeVisible({ timeout: 5000 });
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
    mockVoiceUpload(page, 201, { submission: { id: "v1", type: "VOICE_NOTE" }, usage: { guest_name: "QA Tester", photos_submitted: 0, photos_remaining: 5, voice_note_submitted: true, voice_note_available: false, guest_message_submitted: false, guest_message_available: true } });

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

  // 11. PHOTO: multiple captures before sync (batch)
  test("photo: multiple captures then batch sync", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    let uploadCount = 0;
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      uploadCount++;
      session.addPhoto();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: `p${uploadCount}`, type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);

    // Capture 2 photos via file picker.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await fileInput.setInputFiles({ name: "photo2.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByRole("button", { name: /Photo 2/ })).toBeVisible({ timeout: 3000 });

    // Send both.
    await page.getByRole("button", { name: /Send 2 photos/ }).click();

    // Both saved.
    await expect(page.getByText("2 photos saved.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Photos remaining:")).toContainText("3/5", { timeout: 5000 });
  });

  // 12. PHOTO: delete pending photo before sync
  test("photo: delete pending photo frees budget", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mockStatefulSession(page);
    mockPhotoUpload(page, 201, { submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: 1, photos_remaining: 4, voice_note_submitted: false, voice_note_available: true, guest_message_submitted: false, guest_message_available: true } });

    await startSession(page);

    // Capture a photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });

    // Open review overlay and delete.
    await page.getByRole("button", { name: /Photo 1/ }).click();
    await expect(page.getByRole("dialog", { name: "Photo review" })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: "Delete" }).click();

    // Pending strip should be empty — no Send photos button. (Scoped to the
    // photo region: the guest-message "Send message" button is unrelated.)
    await expect(page.getByRole("button", { name: /Send \d+ photo/ })).toHaveCount(0);
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
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: { guest_name: "QA Tester", photos_submitted: 1, photos_remaining: 4, voice_note_submitted: false, voice_note_available: true, guest_message_submitted: false, guest_message_available: true } }),
      });
    });

    await startSession(page);
    await expect(page.getByText("5 photos remaining")).toBeVisible();

    // Capture a photo.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("4 photos remaining")).toBeVisible();

    // Open review and Retake.
    await page.getByRole("button", { name: /Photo 1/ }).click();
    const dialog = page.getByRole("dialog", { name: "Photo review" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await dialog.getByRole("button", { name: "Retake" }).click();

    // Dialog closed, strip empty, no Send photos button, budget restored.
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Photo 1/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send \d+ photo/ })).toHaveCount(0);
    await expect(page.getByText("5 photos remaining")).toBeVisible();

    // No upload happened.
    expect(photoPosts).toBe(0);
  });

  // 14. PHOTO REVIEW: confirmed photo has no Retake or Delete, Back only
  test("photo: confirmed review has Back only, no Retake or Delete", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const session = mockStatefulSession(page);
    page.unroute(`**/api/events/${EVENT_ID}/photos`);
    page.route(`**/api/events/${EVENT_ID}/photos`, async (route) => {
      session.addPhoto();
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({ submission: { id: "p1", type: "PHOTO" }, usage: uploadUsage(session) }),
      });
    });

    await startSession(page);

    // Capture + send → confirmed.
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({ name: "photo1.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) });
    await expect(page.getByRole("button", { name: /Photo 1/ })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: /Send 1 photo/ }).click();
    await expect(page.getByText("1 photo saved.")).toBeVisible({ timeout: 5000 });

    // Open review: Back present; Retake and Delete absent for confirmed.
    await page.getByRole("button", { name: /Photo 1/ }).click();
    const dialog = page.getByRole("dialog", { name: "Photo review" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Retake" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });
});
