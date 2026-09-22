// Quick after-probe: verify mount + input + no errors for all 4 games
import { chromium } from "@playwright/test";
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
const games = [
  { name: "turbo", url: "http://127.0.0.1:5199/apps/showcase-turbo-drift-circuit/", global: "__AURA3D_TURBO_ACCEPTANCE_CAPTURE__", pump: "__AURA3D_TURBO_ACCEPTANCE_CAPTURE__.pumpRealInput", key: "KeyW" },
  { name: "skyline", url: "http://127.0.0.1:5199/apps/showcase-skyline-runner/", global: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", pump: "__AURA3D_SKYLINE_PUMP__.pump", key: "KeyD" },
  { name: "courier", url: "http://127.0.0.1:5199/apps/showcase-courier-rush/", global: "__AURA3D_SHOWCASE_COURIER_RUSH__", pump: "__COURIER_RUSH_DEBUG__.pump", key: "KeyW" },
  { name: "patrol", url: "http://127.0.0.1:5199/apps/showcase-patrol-wing/", global: "__PATROL_WING_EVIDENCE__", pump: "__PW_PUMP__", key: "ShiftLeft" },
];
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"] });
for (const g of games) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  try {
    await page.goto(g.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction((n) => !!window[n], g.global, { timeout: 120000 });
    await page.keyboard.down(g.key);
    await page.evaluate(`window.${g.pump}(30)`);
    await page.keyboard.up(g.key);
    console.log(`${g.name}: MOUNT+INPUT OK, errors=${errs.length}`);
  } catch (e) {
    console.log(`${g.name}: FAILED - ${String(e).slice(0, 100)}`);
  }
  await page.close();
}
await browser.close();
