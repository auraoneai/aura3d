import { chromium } from "@playwright/test";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const vw = Number(process.env.VW || "1280"), vh = Number(process.env.VH || "720");
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
await page.goto("http://localhost:5199/apps/showcase-turbo-drift-circuit/", { waitUntil: "load", timeout: 90000 });
log("loaded, waiting 45s for mount...");
await page.waitForTimeout(45000);
// measure rAF intervals (frame time)
const deltas = await page.evaluate(() => new Promise((res) => {
  const ds = []; let last = performance.now(); let n = 0;
  const loop = (t) => { ds.push(t - last); last = t; if (++n < 12) requestAnimationFrame(loop); else res(ds); };
  requestAnimationFrame(loop);
})).catch((e) => ["eval-failed:" + String(e).slice(0, 80)]);
log("rAF deltas ms:", JSON.stringify(deltas));
const t1 = Date.now();
await page.screenshot({ path: `/tmp/frame-${vw}x${vh}.png` });
log(`page.screenshot took ${Date.now() - t1}ms`);
await browser.close();
