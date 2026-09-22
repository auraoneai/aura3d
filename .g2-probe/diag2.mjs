import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[cerr]", m.text().slice(0, 250)); });
page.on("pageerror", (e) => console.log("[perr]", String(e).slice(0, 250)));
await page.goto(process.argv[2] || "http://127.0.0.1:5186/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);
const diag = await page.evaluate(() => {
  const rr = window.__AURA3D_ROUTE_READY__;
  const out = { status: rr?.status, ready: rr?.ready };
  // copy shallow fields except scene
  for (const k of Object.keys(rr || {})) {
    if (k === "scene") continue;
    try { out[k] = JSON.parse(JSON.stringify(rr[k])).toString().slice(0, 300); } catch { out[k] = typeof rr[k]; }
  }
  const apps = window.__AURA3D_LIVE_APPS__;
  out.liveAppKeys = apps ? Object.keys(apps) : null;
  // turbo evidence global name candidates
  for (const k of ["__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__", "__COURIER_RUSH_EVIDENCE__", "__PATROL_WING_EVIDENCE__", "__AURA3D_SHOWCASE_PATROL_WING__"]) {
    if (window[k]) out["has_" + k] = true;
  }
  const c = document.querySelector("canvas");
  out.canvas = c ? [c.width, c.height] : null;
  try { out.diagErrors = (rr?.diagnostics?.errors || []).slice(0, 8); } catch (e) { out.diagErrors = String(e).slice(0,200); }
  try { out.diagKeys = rr?.diagnostics ? Object.keys(rr.diagnostics) : null; } catch (e) {}
  out.bodyReady = document.body.dataset.aura3dReady;
  return out;
});
console.log(JSON.stringify(diag, null, 1));
await browser.close();
