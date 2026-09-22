import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5199/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { timeout: 120000 });
console.log("mounted");
await page.waitForTimeout(3000);
const ev = () => page.evaluate(() => {
  const e = window["__AURA3D_SHOWCASE_SKYLINE_RUNNER__"];
  return { y: e.player.y, grounded: e.player.grounded, vy: e.player.vy };
});
let e0 = await ev();
console.log("before:", JSON.stringify(e0));
// Pause, then real keydown, then step
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].pause());
await page.keyboard.down("Space");
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].step(30));
let e1 = await ev();
console.log("after 30 steps:", JSON.stringify(e1));
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].step(30));
let e2 = await ev();
console.log("after 60 steps:", JSON.stringify(e2));
await page.keyboard.up("Space");
await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].resume());
console.log(e1.grounded === false || e1.vy > 0.1 ? "JUMP WORKS" : "JUMP FAILED");
await browser.close();
