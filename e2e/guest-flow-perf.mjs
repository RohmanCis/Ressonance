// Guest-flow performance measurement — Lighthouse User Flow (dev tool, not part of e2e suite).
// Walks the full guest UX (DESIGN.md §5): PreSession → FrameSelect → Capture →
// PhotoReview → Voice → Done on /e/{id} with route mocks identical to
// e2e/mobile-media-qa.spec.ts (no live DB writes).
// Usage: node e2e/guest-flow-perf.mjs  (requires dev server on :3000)
// Output: perf-reports/guest-flow-report.html + step metrics to stdout.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { UserFlow } from "lighthouse/core/user-flow.js";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const EVENT_ID = "qa-media-event";
const OUT_DIR = "perf-reports";

// Locate the Playwright-installed Chromium (AGENTS.md: Chromium is installed).
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

// --- Stateful API mocks (mirror mobile-media-qa.spec.ts) ---
function makeMocks() {
  let photos = 0;
  let voice = false;
  const usage = () => ({
    guest_name: "QA Tester",
    photos_submitted: photos,
    photos_remaining: 5 - photos,
    voice_note_submitted: voice,
    voice_note_available: !voice,
  });
  return {
    usage,
    addPhoto: () => { photos++; },
    addVoice: () => { voice = true; },
    async handle(req) {
      const url = new URL(req.url());
      const p = url.pathname;
      const json = (status, body) => req.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (req.method() === "GET" && p === `/api/events/${EVENT_ID}`) return json(200, { event: { title: "QA Media Event", status: "ACTIVE" } });
      if (p === `/api/events/${EVENT_ID}/session`) {
        if (req.method() === "POST") return json(201, { session: usage() });
        return json(200, { ...usage(), event: { title: "QA Media Event", status: "ACTIVE" } });
      }
      if (req.method() === "POST" && p === `/api/events/${EVENT_ID}/photos`) {
        await new Promise((r) => setTimeout(r, 200));
        this.addPhoto();
        return json(201, { submission: { id: `p${photos}`, type: "PHOTO" }, usage: usage() });
      }
      if (req.method() === "POST" && p === `/api/events/${EVENT_ID}/voice-notes`) {
        this.addVoice();
        return json(201, { submission: { id: "v1", type: "VOICE_NOTE" }, usage: usage() });
      }
      return req.continue();
    },
  };
}

// --- Puppeteer helpers (DOM-level, React-safe) ---
// Match visible text OR accessible names (aria-label), like Playwright's getByRole name.
// Bodies must be self-contained: waitForFunction evaluates them in page context.
const waitText = (page, text, timeout = 8000) =>
  page.waitForFunction(
    (t) =>
      document.body.innerText.includes(t) ||
      [...document.querySelectorAll("[aria-label]")].some((n) => (n.getAttribute("aria-label") ?? "").includes(t)),
    { timeout },
    text,
  );
const waitTextGone = (page, text, timeout = 8000) =>
  page.waitForFunction(
    (t) =>
      !document.body.innerText.includes(t) &&
      ![...document.querySelectorAll("[aria-label]")].some((n) => (n.getAttribute("aria-label") ?? "").includes(t)),
    { timeout },
    text,
  );
async function clickByText(page, selector, text, exact = true) {
  const ok = await page.evaluate(
    ({ selector, text, exact }) => {
      const el = [...document.querySelectorAll(selector)].find((n) => {
        const t = n.textContent?.trim() ?? "";
        const label = n.getAttribute("aria-label") ?? "";
        return exact ? t === text || label === text : t.includes(text) || label.includes(text);
      });
      if (!el) return false;
      el.click();
      return true;
    },
    { selector, text, exact },
  );
  if (!ok) throw new Error(`clickByText: not found ${selector} "${text}"`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: findChromium(),
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

  const mocks = makeMocks();
  const bound = (req) => mocks.handle(req);
  await page.setRequestInterception(true);
  page.on("request", bound);

  const flow = new UserFlow(page, { name: "Guest flow — /e/" + EVENT_ID });

  // 1. Cold navigation: PreSession
  await flow.navigate(`${BASE_URL}/e/${EVENT_ID}`, { stepName: "1. PreSession (cold load)" });
  await waitText(page, "QA Media Event");

  // 2. Start → Frame selection
  await flow.startTimespan({ stepName: "2. Start → Frame select" });
  await clickByText(page, "button", "Mulai yuk");
  await waitText(page, "Pilih Frame fotomu");
  await flow.endTimespan();

  // 3. Frame select → Capture (no frame)
  await flow.startTimespan({ stepName: "3. Frame select → Capture" });
  await clickByText(page, "button", "Tanpa Frame, lanjut");
  await waitText(page, "Take photos");
  await flow.endTimespan();

  // 4. Capture: shutter ×2 (fake camera device)
  await flow.startTimespan({ stepName: "4. Capture (shutter ×2)" });
  await clickByText(page, "button", "Take photo");
  await waitText(page, "Photo 1");
  await clickByText(page, "button", "Take photo");
  await waitText(page, "Photo 2");
  await flow.endTimespan();

  // 5. Review + sync
  await flow.startTimespan({ stepName: "5. Photo review + sync" });
  await clickByText(page, "button", "Lanjut →");
  await waitText(page, "Foto kamu");
  await clickByText(page, "button", "Kirim & Lanjut");
  await waitText(page, "Tinggalkan Pesan Suara");
  await flow.endTimespan();

  // 6. Voice: record 1.6s (mocked backend accepts) → submit → Done
  await flow.startTimespan({ stepName: "6. Voice record + submit → Done" });
  await clickByText(page, "button", "Record voice note");
  await waitText(page, "Merekam");
  await new Promise((r) => setTimeout(r, 1600));
  await clickByText(page, "button", "Stop recording");
  await waitText(page, "Durasi:");
  await clickByText(page, "button", "Kirim Pesan Suara");
  await waitTextGone(page, "Tinggalkan Pesan Suara");
  await flow.endTimespan();

  page.off("request", bound);
  await browser.close();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outHtml = path.join(OUT_DIR, "guest-flow-report.html");
  fs.writeFileSync(outHtml, await flow.generateReport());

  // Compact stdout summary per step.
  const result = JSON.parse(JSON.stringify(await flow.createFlowResult()));
  console.log(`\nGuest flow report: ${outHtml}\n`);
  for (const step of result.steps) {
    const m = step.lhr.audits ?? {};
    const val = (id) => (m[id] ? `${Math.round(m[id].numericValue ?? 0)}${m[id].displayValue ? ` ${m[id].displayValue}` : ""}` : "—");
    console.log(`${step.name}`);
    console.log(`  LCP ${val("largest-contentful-paint")} | CLS ${val("cumulative-layout-shift")} | TBT ${val("total-blocking-time")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
