import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__PATROL_WING_EVIDENCE__", { timeout: 120000 });
console.log("mounted");
const ev = () => page.evaluate(() => {
  const e = window["__PATROL_WING_EVIDENCE__"];
  return { throttle: e.throttle, speed: e.speed, altitude: e.altitude, grounded: e.grounded, state: e.state };
});
let e0 = await ev();
console.log("before:", JSON.stringify(e0));
await page.keyboard.down("ShiftLeft");
await page.evaluate(() => window.__PW_PUMP__(60));
await page.keyboard.up("ShiftLeft");
let e1 = await ev();
console.log("after Shift 60:", JSON.stringify(e1));
console.log((e1.throttle ?? 0) > (e0.throttle ?? 0) ? "THROTTLE WORKS" : "THROTTLE FAILED");
console.log("pageerrors:", errs.length);
await browser.close();
