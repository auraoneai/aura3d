import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 100), r.failure()?.errorText));
console.log("goto...");
await page.goto("http://127.0.0.1:5186/", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("loaded, waiting 45s...");
await page.waitForTimeout(45000);
const s = await page.evaluate(() => ({
  canvas: !!document.querySelector("canvas"),
  apps: window.__AURA3D_LIVE_APPS__ ? Object.keys(window.__AURA3D_LIVE_APPS__) : null,
  ready: window.__AURA3D_ROUTE_READY__?.status,
  body: document.body.dataset.aura3dReady,
  title: document.title
}));
console.log("STATE:", JSON.stringify(s));
await page.screenshot({ path: "/tmp/turbo-state.png" });
await browser.close();
console.log("done");
