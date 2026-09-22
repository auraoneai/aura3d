import { chromium } from "@playwright/test";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e?.message ?? e).slice(0, 160)));
await page.goto("http://localhost:5199/apps/showcase-turbo-drift-circuit/", { waitUntil: "load", timeout: 90000 });
log("loaded");
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(15000);
  let s = null;
  try {
    s = await Promise.race([
      page.evaluate(() => {
        const ev = window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__ ?? null;
        const d = ev?.diagnostics ?? null;
        const c = document.querySelector("canvas");
        return {
          ev: !!ev, frameCount: ev?.frameCount ?? null,
          mounted: d?.renderer?.runtime?.mounted ?? null, drawCalls: d?.drawCalls ?? null,
          backend: d?.backend ?? null,
          assets: Array.isArray(d?.assets) ? d.assets.map((a) => `${a.id}:${a.status}`) : null,
          diagErrors: d?.errors?.length ?? null,
          canvas: !!c, hudLen: (document.body?.innerText ?? "").trim().length,
        };
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 10000)),
    ]);
  } catch (e) { s = { evalError: String(e).slice(0, 100) }; }
  log(`t=${(i + 1) * 15}s`, JSON.stringify(s));
  if (s && s.mounted === true && (s.drawCalls ?? 0) > 0 && Array.isArray(s.assets) && s.assets.every((a) => a.endsWith(":ready"))) { log("MOUNTED"); break; }
}
log("errors:", JSON.stringify(errs.slice(0, 8)));
await browser.close();
