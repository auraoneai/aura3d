import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.ROOFTOP_CANDIDATE_URL ?? "http://127.0.0.1:5199";
const screenshotPath = resolve(here, "rooftop-athletes-exact-route.png");
const evidencePath = resolve(here, "rooftop-athletes-exact-route.json");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
page.setDefaultTimeout(120_000);

const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(`${baseUrl}/?capture=review`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => {
  const evidence = window.__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__;
  return evidence?.mounted === true && typeof window.__RB_ACTIVE_SHOT__ === "function";
});
await page.waitForTimeout(20_000);
await page.evaluate(() => {
  window.__RB_ACTIVE_SHOT__?.();
  window.__RB_PUMP__?.(9);
});
await page.waitForTimeout(1_200);

const snapshot = await page.evaluate(() => ({
  route: window.__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__,
  renderer: window.__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__?.renderer,
  canvases: [...document.querySelectorAll("canvas")].map((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    rect: canvas.getBoundingClientRect().toJSON()
  }))
}));
await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 120_000 });

const output = {
  producer: "rooftop-athlete-candidate-exact-route",
  url: `${baseUrl}/?capture=review`,
  viewport: [1440, 1000],
  screenshotPath,
  pageErrors,
  consoleErrors,
  snapshot
};
await writeFile(evidencePath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output));
await browser.close();
