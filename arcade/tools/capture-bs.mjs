/**
 * Backspin capture: stages the signature moment — the trick tapped mid-air
 * with rotation and dust, not after landing.
 *
 * Usage: node arcade/tools/capture-bs.mjs <url> <outDir>
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: capture-bs.mjs <url> <outDir>");
  process.exit(2);
}
const out = resolve(outDir);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--js-flags=--max-old-space-size=2048"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 });

const readState = () =>
  page.evaluate(() => globalThis.__AURA3D_ARCADE_STATE__ ?? null).catch(() => null);

// opening: ride line at rest
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/opening.png` });
const opening = await readState();

// mid: rolling along the canyon
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/mid.png` });
const mid = await readState();

// signature: tap the trick and shoot MID-AIR (airtime is short — ~160-220 ms)
await page.keyboard.press("Space");
await page.waitForTimeout(180);
await page.screenshot({ path: `${out}/signature.png` });
const signature = await readState();

// action: extend the combo with a second tap, then let it land
await page.keyboard.press("Space");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/action.png` });
const action = await readState();

const diagnostics = await page.evaluate(() => {
  const apps = globalThis.__AURA3D_LIVE_APPS__;
  if (!apps || typeof apps.all !== "function") return null;
  const first = apps.all()[0];
  return first && typeof first.diagnostics === "function" ? first.diagnostics() : null;
});

console.log(JSON.stringify({ url, opening, mid, signature, action, drawCalls: diagnostics?.drawCalls ?? null, consoleErrors }, null, 2));
await browser.close();
