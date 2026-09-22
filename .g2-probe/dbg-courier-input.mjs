import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:5199/apps/showcase-courier-rush/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__AURA3D_SHOWCASE_COURIER_RUSH__", { timeout: 120000 });
console.log("mounted");
const ev = () => page.evaluate(() => {
  const e = window["__AURA3D_SHOWCASE_COURIER_RUSH__"];
  return { speed: e.van?.speed, x: e.van?.x, z: e.van?.z, heading: e.van?.heading, state: e.state };
});
let e0 = await ev();
console.log("before:", JSON.stringify(e0));
await page.keyboard.down("KeyW");
await page.evaluate(() => window["__COURIER_RUSH_DEBUG__"].pump(60));
await page.keyboard.up("KeyW");
let e1 = await ev();
console.log("after W 60:", JSON.stringify(e1));
console.log(e1.speed > (e0.speed ?? 0) + 0.5 ? "THROTTLE WORKS" : "THROTTLE FAILED");
// Steering
await page.keyboard.down("KeyW"); await page.keyboard.down("KeyA");
await page.evaluate(() => window["__COURIER_RUSH_DEBUG__"].pump(60));
await page.keyboard.up("KeyA"); await page.keyboard.up("KeyW");
let e2 = await ev();
console.log("after W+A 60:", JSON.stringify(e2));
console.log(Math.abs(e2.heading - e1.heading) > 0.01 ? "STEER WORKS" : "STEER FAILED");
console.log("pageerrors:", errs.length);
await browser.close();
