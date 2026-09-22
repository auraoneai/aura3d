import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5199/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { timeout: 120000 });
console.log("mounted");
const ev = () => page.evaluate(() => {
  const e = window["__AURA3D_SHOWCASE_SKYLINE_RUNNER__"];
  return { y: e.player.y, grounded: e.player.grounded };
});
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].pump(120));
let e0 = await ev();
console.log("landed:", JSON.stringify(e0));
// Try KeyW instead of Space
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].pause());
await page.keyboard.down("KeyW");
await page.waitForTimeout(100);
const held = await page.evaluate(() => {
  // Check if the game's input sees it (via a debug hook if available)
  return document.hasFocus();
});
console.log("hasFocus:", held);
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].step(15));
let e1 = await ev();
console.log("after KeyW 15 steps:", JSON.stringify(e1));
await page.keyboard.up("KeyW");
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].resume());
await browser.close();
