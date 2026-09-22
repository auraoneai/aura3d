import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__PATROL_WING_EVIDENCE__", { timeout: 120000 });
console.log("mounted, rendering...");
// Let it render via the shot seam (which pumps and captures)
const dataUrl = await page.evaluate(() => window.__PW_SHOT__(), { timeout: 300000 });
if (dataUrl) {
  writeFileSync("tests/reports/game-upgrade-2026-09/before/patrol/01-first-load.png", Buffer.from(String(dataUrl).split(",")[1], "base64"));
  console.log("shot 01 saved");
}
// Throttle up and take another
await page.keyboard.down("ShiftLeft");
await page.evaluate(() => window.__PW_PUMP__(60));
await page.keyboard.up("ShiftLeft");
const dataUrl2 = await page.evaluate(() => window.__PW_SHOT__(), { timeout: 300000 });
if (dataUrl2) {
  writeFileSync("tests/reports/game-upgrade-2026-09/before/patrol/02-gameplay.png", Buffer.from(String(dataUrl2).split(",")[1], "base64"));
  console.log("shot 02 saved");
}
await browser.close();
