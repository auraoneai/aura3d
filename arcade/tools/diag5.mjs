import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(process.argv[2], { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2000);
const d = await page.evaluate(() => {
  const app = globalThis.__AURA3D_LIVE_APPS__.all()[0];
  const diag = app.diagnostics();
  return {
    keys: Object.keys(diag),
    rendering: diag.rendering ?? null,
    collection: diag.collection ?? diag.rendering?.collection ?? null
  };
});
console.log(JSON.stringify(d, null, 1).slice(0, 2600));
await browser.close();
