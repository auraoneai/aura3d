import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:5199/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { timeout: 120000 });
console.log("mounted");
await page.waitForTimeout(5000);
const t0 = Date.now();
const r = await page.evaluate(() => window["__AURA3D_SKYLINE_PUMP__"].pump(10));
console.log(`pump(10) took ${Date.now() - t0}ms, frame=${r}`);
await browser.close();
