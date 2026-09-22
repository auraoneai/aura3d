import { chromium } from "@playwright/test";
const t0 = Date.now();
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e?.message ?? e).slice(0, 200)));
try {
  await page.goto("http://localhost:5199/apps/showcase-turbo-drift-circuit/", { waitUntil: "load", timeout: 90000 });
  console.log("loaded in", Date.now() - t0, "ms");
} catch (e) { console.log("goto failed:", String(e).slice(0, 200)); }
for (let i = 0; i < 12; i++) {
  const s = await page.evaluate(() => ({ c: !!document.querySelector("canvas"), h: (document.body?.innerText ?? "").trim().length })).catch(() => null);
  console.log(i, Date.now() - t0, JSON.stringify(s));
  if (s && s.c && s.h > 12) break;
  await page.waitForTimeout(5000);
}
const t1 = Date.now();
await page.screenshot({ path: "/tmp/quick-turbo.png" });
console.log("screenshot took", Date.now() - t1, "ms");
console.log("errors:", JSON.stringify(errs.slice(0, 5)));
await browser.close();
