// Admin dashboard performance measurement — authenticated Lighthouse (dev tool, not e2e suite).
// Signs in via /admin/sign-in using ADMIN_EMAIL/ADMIN_PASSWORD (default smoke credentials),
// then runs Lighthouse on the event dashboard page.
// Usage: node e2e/admin-flow-perf.mjs [public_id]  (requires prod server on :3000)
// Output: perf-reports/admin-dash-report.html + scores to stdout.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import lighthouse from "lighthouse/core/index.js";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "smoke-admin@example.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "test123";
const EVENT_ID = process.argv[2] ?? "tnqbbcMsf1TeSUXEA_k6AQ";
const OUT_DIR = "perf-reports";

function findChromium() {
  const root = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (!fs.existsSync(root)) throw new Error(`ms-playwright dir not found: ${root}`);
  const dirs = fs
    .readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse();
  for (const d of dirs) {
    const base = path.join(root, d);
    const exe = fs
      .readdirSync(base, { recursive: true })
      .map((f) => path.join(base, f.toString()))
      .find((f) => f.endsWith("chrome.exe"));
    if (exe) return exe;
  }
  throw new Error("No chromium chrome.exe found under ms-playwright");
}

const browser = await puppeteer.launch({
  executablePath: findChromium(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  // Sign in through the real form to get the HttpOnly session cookie.
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/admin/sign-in`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.type("#email", EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
    page.click("form button"),
  ]);
  const url = page.url();
  if (/sign-in/.test(url)) throw new Error(`Sign-in failed, still on: ${url}`);
  console.log(`Signed in — landed on ${url}`);
  await page.close();

  const runnerResult = await lighthouse(`${BASE_URL}/admin/events/${EVENT_ID}`, {
    port: new URL(browser.wsEndpoint()).port,
    output: "html",
    onlyCategories: ["performance"],
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2, disabled: false },
  }, { extends: "lighthouse:default", settings: { throttlingMethod: "simulate", throttling: { rttMs: 40, throughputKbps: 10240, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0, cpuSlowdownMultiplier: 1 } } });

  const { categories, audits } = runnerResult.lhr;
  console.log("\n=== Admin dashboard (authenticated, prod) ===");
  console.log(`Perf score: ${categories.performance.score * 100}`);
  for (const k of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"]) {
    console.log(`${audits[k].title}: ${audits[k].displayValue}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "admin-dash-report.html");
  fs.writeFileSync(out, runnerResult.report);
  console.log(`\nReport: ${out}`);
} finally {
  await browser.close();
}
