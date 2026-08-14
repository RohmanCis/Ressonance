import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "fs";

// T029 Print QA — each print variant produces exactly one A4 page with
// correct content and full admin-chrome isolation under @media print.
// Requires headless Chromium (page.pdf is headless-only).

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
  await page.route(`**/api/admin/events/${EVENT_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ event: { public_id: EVENT_ID, title: EVENT_TITLE, status: "ACTIVE" } }) });
  });
});

/** Count PDF pages by matching /Type /Page (not /Pages) dictionaries. */
function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

/** Override window.print (no-op) so the native dialog never blocks; afterprint
 *  never fires, so printVariant stays set and the artifact stays in the DOM. */
async function selectPrintOption(page: Page, optionName: string) {
  await page.evaluate(() => { (window as any).print = () => {}; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("menuitem", { name: optionName }).click();
}

test("Print QR only: exactly one page, title + QR + URL, no chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  await selectPrintOption(page, "Print QR only");
  await expect(page.getByText("Preparing QR code for printing…")).toBeVisible();

  await page.emulateMedia({ media: "print" });

  // Admin chrome hidden in print.
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByText("Put the doorway on the table.")).toBeHidden();
  await expect(page.getByText("Public URL", { exact: true })).toBeHidden();
  await expect(page.getByText("QR access", { exact: true })).toBeHidden();
  await expect(page.getByText("Copy link", { exact: true })).toBeHidden();
  await expect(page.locator("#public-url")).toBeHidden();

  // QR-only content visible: title + URL. No guest instruction.
  await expect(page.getByText(EVENT_TITLE)).toBeVisible();
  await expect(page.getByText(EXPECTED_URL)).toBeVisible();
  await expect(page.getByText("Scan to share your photos and voice notes.")).toBeHidden();

  // Report exact printed text.
  const printedText = (await page.evaluate(() => document.body.innerText)).trim();
  console.log("[PRINT_QR_ONLY]\n" + printedText);

  // PDF: exactly one page.
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  writeFileSync("e2e/print-qr-only.pdf", pdf);
  expect(countPdfPages(pdf)).toBe(1);
});

test("Print access card: exactly one page, title + QR + instruction + URL, no chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  await selectPrintOption(page, "Print access card");
  await expect(page.getByText("Preparing access card for printing…")).toBeVisible();

  await page.emulateMedia({ media: "print" });

  // Admin chrome hidden in print.
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByText("Put the doorway on the table.")).toBeHidden();
  await expect(page.getByText("Public URL", { exact: true })).toBeHidden();
  await expect(page.getByText("QR access", { exact: true })).toBeHidden();
  await expect(page.getByText("Copy link", { exact: true })).toBeHidden();
  await expect(page.locator("#public-url")).toBeHidden();

  // Card content visible: title + guest instruction + URL.
  await expect(page.getByText(EVENT_TITLE)).toBeVisible();
  await expect(page.getByText("Scan to share your photos and voice notes.")).toBeVisible();
  await expect(page.getByText(EXPECTED_URL)).toBeVisible();

  // Report exact printed text.
  const printedText = (await page.evaluate(() => document.body.innerText)).trim();
  console.log("[PRINT_ACCESS_CARD]\n" + printedText);

  // PDF: exactly one page.
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  writeFileSync("e2e/print-access-card.pdf", pdf);
  expect(countPdfPages(pdf)).toBe(1);
});

test("Print menu keyboard navigation (a11y)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  const trigger = page.getByRole("button", { name: "Print", exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();

  // Enter opens menu; first item auto-focused.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Print QR only" })).toBeFocused();

  // ArrowDown → second item.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Print access card" })).toBeFocused();

  // ArrowUp wraps → first item.
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Print QR only" })).toBeFocused();

  // Escape closes, returns focus to trigger.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Action row clean at mobile 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/admin/events/${EVENT_ID}/access`, { waitUntil: "networkidle" });

  const copyBtn = page.getByRole("button", { name: "Copy link" });
  const printBtn = page.getByRole("button", { name: "Print", exact: true });
  await expect(copyBtn).toBeVisible();
  await expect(printBtn).toBeVisible();

  // Both fit within viewport (no horizontal overflow).
  const copyBox = await copyBtn.boundingBox();
  const printBox = await printBtn.boundingBox();
  expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(375);
  expect(printBox!.x + printBox!.width).toBeLessThanOrEqual(375);
});
