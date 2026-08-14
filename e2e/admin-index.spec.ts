import { test, expect, Page } from "@playwright/test";

// T031 Admin Event Index — route-intercepted (no live backend).
// Mocks admin auth + events API to verify /admin index behavior per UI_UX §5.5.
// Serial: cross-page Next Link navigations contend for one dev server; running
// these in parallel workers starves compilations and flakes URL assertions.
test.describe.configure({ mode: "serial" });

const ACTIVE = {
  public_id: "active-evt-001",
  title: "Summer Party",
  status: "ACTIVE",
  created_at: "2026-08-10T14:00:00.000Z",
  closed_at: null,
};
const CLOSED = {
  public_id: "closed-evt-002",
  title: "Winter Dinner",
  status: "CLOSED",
  created_at: "2026-07-01T10:00:00.000Z",
  closed_at: "2026-07-02T20:00:00.000Z",
};

const json = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function mockEvents(page: Page, events: unknown[]) {
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill(json(200, { events }));
  });
}

test.beforeEach(async ({ context, page }) => {
  // /admin gates on Supabase auth-cookie presence server-side; the mocked API
  // below stands in for real session validation.
  await context.addCookies([{ name: "sb-qa-auth-token", value: "1", domain: "localhost", path: "/" }]);
  await page.route("**/api/admin/me", async (route) => {
    await route.fulfill(json(200, { admin: { email: "qa@test.com" } }));
  });
  await mockEvents(page, [ACTIVE, CLOSED]);
});

test("unauthenticated /admin redirects to sign-in", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

test("sign-in lands on the event index", async ({ page }) => {
  await page.route("**/api/admin/auth/sign-in", async (route) => {
    await route.fulfill(json(200, { admin: { email: "qa@test.com" } }));
  });
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill("qa@test.com");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Your events." })).toBeVisible();
  await expect(page.getByText("Summer Party")).toBeVisible({ timeout: 15000 });
});

test("ACTIVE event is prominent; CLOSED event stays accessible", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Your events." })).toBeVisible();

  const activeSection = page.getByRole("region", { name: "Active event" });
  await expect(activeSection.getByRole("heading", { name: "Summer Party" })).toBeVisible();
  await expect(activeSection.getByText("Active", { exact: true })).toBeVisible();

  const pastSection = page.getByRole("region", { name: "Past events" });
  await expect(pastSection.getByText("Winter Dinner")).toBeVisible();
  await expect(pastSection.getByText("Closed", { exact: true })).toBeVisible();

  // Access/QR only on the ACTIVE event; Open on both.
  await expect(activeSection.getByRole("link", { name: "Access / QR" })).toHaveAttribute("href", `/admin/events/${ACTIVE.public_id}/access`);
  await expect(pastSection.getByRole("link", { name: "Access / QR" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open" })).toHaveCount(2);
});

test("Open navigates to the event dashboard", async ({ page }) => {
  await page.goto("/admin");
  // Wait for client-rendered content: proves hydration before clicking Next links.
  await expect(page.getByRole("heading", { name: "Summer Party" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("region", { name: "Active event" }).getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${ACTIVE.public_id}$`), { timeout: 15000 });
});

test("Access / QR navigates to the access page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Summer Party" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: "Access / QR" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${ACTIVE.public_id}/access$`), { timeout: 15000 });
});

test("Create new event navigates to creation and succeeds end-to-end", async ({ page }) => {
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill(json(201, { event: ACTIVE, public_url: `http://localhost:3000/e/${ACTIVE.public_id}` }));
  });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Summer Party" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: "Create new event" }).click();
  await expect(page).toHaveURL(/\/admin\/events\/new$/, { timeout: 15000 });

  await page.getByLabel("Event title").fill("Summer Party");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${ACTIVE.public_id}$`), { timeout: 15000 });
});

test("failure state offers deliberate retry and recovers", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    calls += 1;
    if (calls === 1) {
      await route.fulfill(json(500, { error: { code: "INTERNAL_ERROR", message: "The service could not complete the operation." } }));
    } else {
      await route.fulfill(json(200, { events: [ACTIVE, CLOSED] }));
    }
  });
  await page.goto("/admin");
  await expect(page.getByText("The event list could not be loaded. Retry safely.")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Summer Party" })).toBeVisible({ timeout: 15000 });
  expect(calls).toBe(2);
});

test("empty state points to creation", async ({ page }) => {
  await mockEvents(page, []);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "No events yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create event" })).toHaveAttribute("href", "/admin/events/new");
});

test("ACTIVE_EVENT_EXISTS recovery resolves to the index, not sign-in", async ({ page }) => {
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill(json(409, { error: { code: "ACTIVE_EVENT_EXISTS", message: "Another ACTIVE event already exists for this admin." } }));
  });
  await page.goto("/admin/events/new");
  await page.getByLabel("Event title").fill("Duplicate Party");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("An active event already exists. Open it instead.")).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: "Find existing event" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Your events." })).toBeVisible();
  await expect(page.getByText("Summer Party")).toBeVisible({ timeout: 15000 });
});
