/**
 * Vector Nine capture: drives the car (the generic capture.mjs presses
 * Prism-Break keys, which don't throttle this game) and stages the
 * signature moments — speed on deck, an airborne boost jump, and a banked
 * wall-ride on the quarter-pipe.
 *
 * Usage: node arcade/tools/capture-vn.mjs <url> <outDir>
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: capture-vn.mjs <url> <outDir>");
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

// opening: countdown / start line
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/opening.png` });
const opening = await readState();

// mid: full throttle down the start straight
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/mid.png` });
const mid = await readState();

// action: boost + jump (airborne trick)
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(700);
await page.keyboard.press("Space");
await page.waitForTimeout(380);
await page.screenshot({ path: `${out}/action.png` });
const action = await readState();

// signature: banked wall-ride — hold boost, steer hard into the quarter-pipe,
// wait until the beacon reports wallRiding, then shoot.
await page.keyboard.up("ShiftLeft");
let signature = await readState();
let wallShot = false;
for (let attempt = 0; attempt < 3 && !wallShot; attempt += 1) {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down(attempt % 2 === 0 ? "ArrowRight" : "ArrowLeft");
  const deadline = Date.now() + 4200;
  while (Date.now() < deadline) {
    signature = await readState();
    if (signature && signature.wallRiding && Math.abs(signature.wallAngleDeg ?? 0) > 12) break;
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path: `${out}/signature.png` });
  signature = await readState();
  wallShot = Boolean(signature && signature.wallRiding);
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.up(attempt % 2 === 0 ? "ArrowRight" : "ArrowLeft");
  if (!wallShot) await page.waitForTimeout(400);
}
if (!wallShot && !existsSync(`${out}/signature.png`)) {
  await page.screenshot({ path: `${out}/signature.png` });
}

const diagnostics = await page.evaluate(() => {
  const apps = globalThis.__AURA3D_LIVE_APPS__;
  if (!apps || typeof apps.all !== "function") return null;
  const first = apps.all()[0];
  return first && typeof first.diagnostics === "function" ? first.diagnostics() : null;
});

console.log(JSON.stringify({ url, opening, mid, action, signature, wallRideCaptured: wallShot, drawCalls: diagnostics?.drawCalls ?? null, consoleErrors }, null, 2));
await browser.close();
