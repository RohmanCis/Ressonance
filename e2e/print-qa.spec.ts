import { test, expect } from "@playwright/test";
import { writeFileSync } from "fs";

// T029 Print QA — the access page prints ONE bare QR page with full
// admin-chrome isolation under @media print (FIX-6: single Print QR action,
// no menu/variants). Requires headless Chromium (page.pdf is headless-only).

const EVENT_ID = "qa-event-abc123";
const EVENT_TITLE = "Summer Party";
const EXPECTED_URL = `http://localhost:3000/e/${EVENT_ID}`;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ admin: { email: "qa@test.com" } }) });
  });
  await page.route(`**/api/admin/events/${EVENT_ID}/access`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ public_id: EVENT_ID, public_url: EXPECTED_URL }) });
  });
});

/** Count PDF pages by matching /Type /Page (not /Pages) dictionaries. */
function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

test("Print QR: exactly one page, bare QR only, no chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  // Override window.print (no-op) so the native dialog never blocks.
  await page.evaluate(() => { (window as any).print = () => {}; });
  await page.getByRole("button", { name: "Print QR" }).click();

  await page.emulateMedia({ media: "print" });

  // Admin chrome hidden in print.
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByText("Share event access.", { exact: true })).toBeHidden();
  await expect(page.getByText("Copy link", { exact: true })).toBeHidden();
  await expect(page.locator("#public-url")).toBeHidden();

  // Bare QR visible; no title/URL/instruction text on the artifact.
  // Screen QR is print:hidden; the print-only 80mm artifact carries the print label.
  await expect(page.locator('svg[aria-label="Printable QR code for event access"]')).toBeVisible();
  await expect(page.locator('svg[aria-label="QR code for event access"]')).toBeHidden();
  await expect(page.getByText(EVENT_TITLE)).toBeHidden();
  await expect(page.getByText(EXPECTED_URL)).toBeHidden();
  await expect(page.getByText("Scan to share your photos and voice notes.")).toBeHidden();

  // Report exact printed text.
  const printedText = (await page.evaluate(() => document.body.innerText)).trim();
  console.log("[PRINT_QR]\n" + printedText);

  // PDF: exactly one page.
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  writeFileSync("e2e/print-qr.pdf", pdf);
  expect(countPdfPages(pdf)).toBe(1);
});

test("Action row clean at mobile 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  const copyBtn = page.getByRole("button", { name: "Copy link" });
  const printBtn = page.getByRole("button", { name: "Print QR" });
  await expect(copyBtn).toBeVisible();
  await expect(printBtn).toBeVisible();

  // Both fit within viewport (no horizontal overflow).
  const copyBox = await copyBtn.boundingBox();
  const printBox = await printBtn.boundingBox();
  expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(375);
  expect(printBox!.x + printBox!.width).toBeLessThanOrEqual(375);
});
