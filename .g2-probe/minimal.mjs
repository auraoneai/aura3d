import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=3072"]
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
page.on("pageerror", (e) => errors.push("PAGE: " + String(e).slice(0, 120)));
await page.goto("http://127.0.0.1:5186/", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("waiting for canvas...");
await page.waitForFunction(() => document.querySelector("canvas")?.width > 50, { timeout: 90000 });
console.log("canvas found, waiting 30s for assets...");
await page.waitForTimeout(30000);

const state1 = await page.evaluate(() => {
  const g = window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
  const rr = window.__AURA3D_ROUTE_READY__;
  return {
    status: rr?.status,
    diagErrors: (rr?.diagnostics?.errors || []).slice(0, 3).map(e => JSON.stringify(e).slice(0, 200)),
    hasEvidence: !!g,
    evidenceKeys: g ? Object.keys(g).slice(0, 10) : null
  };
});
console.log("STATE1:", JSON.stringify(state1, null, 1).slice(0, 2000));
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
await browser.close();
console.log("done");
