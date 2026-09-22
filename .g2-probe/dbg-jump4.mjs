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
  return { y: e.player.y, grounded: e.player.grounded, frame: e.frameCount };
});
// Wait for landing via real time (game running)
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  const e = await ev();
  if (e.grounded) break;
}
let e0 = await ev();
console.log("landed:", JSON.stringify(e0));
// Press space with game RUNNING (no pause)
await page.keyboard.down("Space");
await page.waitForTimeout(300);
await page.keyboard.up("Space");
let e1 = await ev();
console.log("after space:", JSON.stringify(e1));
// Wait a bit more to see if it went up
await page.waitForTimeout(500);
let e2 = await ev();
console.log("later:", JSON.stringify(e2));
console.log(e1.y > e0.y + 0.05 || e2.y > e0.y + 0.05 ? "JUMP WORKS" : "JUMP FAILED");
await browser.close();
