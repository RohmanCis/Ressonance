import { test, expect } from "@playwright/test";

// Set PLAYWRIGHT_LIVE=1 to exercise the guest Start surface, which requires a
// live backend with a seeded ACTIVE event at /e/smoke-test-event. Off by
// default so the suite stays deterministic without Supabase.
const LIVE = process.env.PLAYWRIGHT_LIVE === "1";

test("admin sign-in surface renders", async ({ page }) => {
  await page.goto("/admin/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("admin index redirects to sign-in (dashboard routing)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

test("guest event entry mounts the app shell", async ({ page }) => {
  await page.goto("/e/smoke-test-event");
  await expect(page.locator("main")).toBeVisible();
});

test("guest event entry shows Start surface (live backend)", async ({ page }) => {
  test.skip(
    !LIVE,
    "requires PLAYWRIGHT_LIVE=1 and a live backend with a seeded ACTIVE event at /e/smoke-test-event",
  );
  await page.goto("/e/smoke-test-event");
  await expect(page.getByLabel(/Your name/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});