import { defineConfig } from "@playwright/test";

// External base URL (e.g. a deployed preview) or local Next.js dev server.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// When PLAYWRIGHT_BASE_URL is provided, assume an external runtime is already
// up and do not spawn a local web server. Otherwise boot `next dev` locally.
const webServer =
  process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
      };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Smoke suite is intentionally small; one project is enough.
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer,
});