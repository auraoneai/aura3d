import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 150)); });
page.on("pageerror", (e) => errors.push("PAGE: " + String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:5186/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("canvas")?.width > 50, { timeout: 60000 });
await page.waitForTimeout(15000);

// Sample the countdown / race state over time
for (let i = 0; i < 6; i++) {
  const s = await page.evaluate(() => {
    const rr = window.__AURA3D_ROUTE_READY__;
    // find countdown text in DOM
    const body = document.body.innerText.slice(0, 200);
    return { status: rr?.status, bodyReady: document.body.dataset.aura3dReady, t: Date.now() };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(5000);
}
await page.screenshot({ path: "/tmp/turbo-reprobe.png" });
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
await browser.close();
