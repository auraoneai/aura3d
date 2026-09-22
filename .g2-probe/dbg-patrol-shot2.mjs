import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__PATROL_WING_EVIDENCE__", { timeout: 120000 });
console.log("mounted");
// Pump to render, then use compositor screenshot
await page.evaluate(() => window.__PW_PUMP__(30));
await page.waitForTimeout(2000);
await page.screenshot({ path: "tests/reports/game-upgrade-2026-09/before/patrol/01-first-load.png" });
console.log("compositor shot 01 saved");
await browser.close();
