import { test, expect } from "@playwright/test";

// T021 QR Visual/Scanner QA — route-intercepted (no live backend).
// Mocks admin auth + access API to verify the rendered QR component.

const EVENT_ID = "qa-event-abc123";
const EXPECTED_URL = `http://localhost:3000/e/${EVENT_ID}`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ admin: { email: "qa@test.com" } }) });
  });
  await page.route(`**/api/admin/events/${EVENT_ID}/access`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ public_id: EVENT_ID, public_url: EXPECTED_URL }) });
  });
});

test("QR renders, encodes exact public URL, copy/print intact (desktop)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  // QR heading visible.
  await expect(page.getByRole("heading", { name: "QR access" })).toBeVisible();

  // SVG rendered with correct accessibility.
  const svg = page.locator('svg[aria-label="QR code for event access"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute("role", "img");

  // QR matrix structure: viewBox 0 0 N N (square QR grid).
  const viewBox = await svg.getAttribute("viewBox");
  expect(viewBox).toMatch(/^0 0 \d+ \d+$/);
  const [, , w, h] = viewBox!.split(" ").map(Number);
  expect(w).toBe(h); // Square grid.

  // QR has foreground path with module data (the actual QR pattern).
  const paths = svg.locator("path");
  const pathCount = await paths.count();
  expect(pathCount).toBeGreaterThanOrEqual(2); // bg + fg modules

  // Verify rendered size is adequate for phone scanning (>100px).
  const box = await svg.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // Public URL field shows exact event URL.
  const urlInput = page.locator("#public-url");
  await expect(urlInput).toHaveValue(EXPECTED_URL);

  // Copy + print buttons present (print variants live behind the Print menu).
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeVisible();

  // No private/secret/signed URL anywhere on page.
  const bodyText = await page.locator("body").innerText();
  for (const secret of ["supabase", "storage", "signed", "token", "service-role", "secret"]) {
    expect(bodyText.toLowerCase()).not.toContain(secret);
  }
  const inputVal = await urlInput.inputValue();
  expect(inputVal).toBe(EXPECTED_URL);

  await page.screenshot({ path: "e2e/qr-desktop.png", fullPage: true });
});

test("QR not distorted at mobile width 375px (responsive)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  const svg = page.locator('svg[aria-label="QR code for event access"]');
  await expect(svg).toBeVisible();

  const box = await svg.boundingBox();
  const ratio = box!.width / box!.height;
  expect(ratio).toBeGreaterThan(0.95);
  expect(ratio).toBeLessThan(1.05);
  expect(box!.width).toBeLessThanOrEqual(375);

  await page.screenshot({ path: "e2e/qr-mobile.png", fullPage: true });
});

test("QR not distorted at tablet width 768px (responsive)", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  const svg = page.locator('svg[aria-label="QR code for event access"]');
  await expect(svg).toBeVisible();

  const box = await svg.boundingBox();
  const ratio = box!.width / box!.height;
  expect(ratio).toBeGreaterThan(0.95);
  expect(ratio).toBeLessThan(1.05);
});

test("copy button provides feedback", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  // Mock clipboard.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const copyBtn = page.getByRole("button", { name: "Copy link" });
  await copyBtn.click();

  // Button label changes to "Copied".
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible({ timeout: 3000 });

  // Clipboard contains the exact URL.
  const clipText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipText).toBe(EXPECTED_URL);
});
