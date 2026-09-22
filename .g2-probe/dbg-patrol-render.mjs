import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__PATROL_WING_EVIDENCE__", { timeout: 120000 });
console.log("mounted");
// Pump more to let scene render
await page.evaluate(() => window.__PW_PUMP__(120));
const info = await page.evaluate(() => {
  const e = window["__PATROL_WING_EVIDENCE__"];
  const canvas = document.querySelector("canvas");
  return {
    state: e.state,
    canvasW: canvas?.width, canvasH: canvas?.height,
    diagErrs: e.diagnostics?.errors?.length ?? 0,
  };
});
console.log("info:", JSON.stringify(info));
console.log("errors:", errs.length, errs.slice(0, 3));
await page.screenshot({ path: "/tmp/patrol-render.png" });
console.log("screenshot saved");
await browser.close();
