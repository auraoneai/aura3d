/**
 * Capture three named frames from a running route: opening / mid / action.
 *
 * Standalone-app equivalent of `aura3d look capture --shots opening,mid,action`:
 * this app lives outside the monorepo route system, so it drives Playwright
 * directly instead of going through the route registry.
 *
 * Usage: node arcade/tools/capture.mjs <url> <outDir>
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: capture.mjs <url> <outDir>");
  process.exit(2);
}
const out = resolve(outDir);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--js-flags=--max-old-space-size=2048"]
});
console.log("step: browser launched");
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
console.log("step: page created");

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
console.log("step: navigated");

// the gate only clears after app.ready(), so its absence is the ready signal
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});

const readState = () =>
  page
    .evaluate(() => window.__AURA3D_ARCADE_STATE__ ?? window.__AURA3D_PRISM_BREAK__ ?? null)
    .catch(() => null);

// Each frame is taken from a fresh live run: an idle paddle accrues strikes and
// the run ends within a few seconds, which would make every shot a game-over
// screen. Restart, orbit the paddle, then shoot.
async function freshRun() {
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(450);
}

await freshRun();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/opening.png` });
const opening = await readState();

await page.keyboard.down("ArrowRight");
await page.waitForTimeout(1500);
await page.keyboard.up("ArrowRight");
await page.screenshot({ path: `${out}/mid.png` });
const mid = await readState();

// Restart, split twice to exercise the shard mechanic, and orbit while shooting.
await freshRun();
await page.keyboard.press("Space");
await page.waitForTimeout(380);
await page.keyboard.press("Space");
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(700);
await page.keyboard.up("ArrowLeft");
await page.screenshot({ path: `${out}/action.png` });
const action = await readState();

const diagnostics = await page.evaluate(() => {
  const apps = globalThis.__AURA3D_LIVE_APPS__;
  if (!apps || typeof apps.all !== "function") return null;
  const first = apps.all()[0];
  return first && typeof first.diagnostics === "function" ? first.diagnostics() : null;
});

// node-level readout: proves the runtime handles are mutating, and shows why a
// node that should be on screen is not. Game-agnostic — dumps whatever the app
// registered, so it works for every game in the slate.
const nodeDump = await page.evaluate(() => {
  const apps = globalThis.__AURA3D_LIVE_APPS__;
  if (!apps || typeof apps.all !== "function") return null;
  const app = apps.all()[0];
  if (!app) return null;
  const ids = typeof app.nodes.ids === "function" ? app.nodes.ids().slice(0, 16) : [];
  const out = {};
  for (const id of ids) {
    try {
      const snap = app.nodes.require(id).snapshot();
      out[id] = {
        visible: snap.visible,
        position: snap.position,
        rotation: snap.rotation,
        scale: snap.scale
      };
    } catch (error) {
      out[id] = { error: String(error).slice(0, 120) };
    }
  }
  return out;
});

console.log(
  JSON.stringify(
    {
      url,
      opening,
      mid,
      action,
      drawCalls: diagnostics?.drawCalls ?? null,
      errors: diagnostics?.errors ?? null,
      nodes: nodeDump,
      consoleErrors
    },
    null,
    2
  )
);

await browser.close();
