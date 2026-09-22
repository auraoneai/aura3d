import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[console." + m.type() + "]", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:5186/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(25000);
const diag = await page.evaluate(() => {
  const out = {};
  out.routeReady = window.__AURA3D_ROUTE_READY__;
  const apps = window.__AURA3D_LIVE_APPS__;
  out.appKeys = apps ? Object.keys(apps) : null;
  const g = window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
  if (g) {
    out.proofKeys = Object.keys(g).slice(0, 30);
    out.startLights = g.startLights ?? g.race?.startLights ?? null;
  }
  const canvas = document.querySelector("canvas");
  out.canvas = canvas ? { w: canvas.width, h: canvas.height } : null;
  // check the evidence global name from main.ts
  out.evidenceKeys = Object.keys(window).filter((k) => k.includes("TURBO") || k.includes("EVIDENCE"));
  return out;
});
console.log(JSON.stringify(diag, null, 2).slice(0, 4000));
await browser.close();
