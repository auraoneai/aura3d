import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--enable-unsafe-webgpu","--ignore-gpu-blocklist","--use-gl=angle","--autoplay-policy=no-user-gesture-required","--use-angle=swiftshader","--disable-dev-shm-usage"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e?.message ?? e).slice(0,200)));
page.on("console", m => { if (m.type()==="error") errs.push("console:"+m.text().slice(0,200)); });
await page.goto("http://127.0.0.1:5199/apps/showcase-patrol-wing/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction((n) => !!window[n], "__AURA3D_SHOWCASE_PATROL_WING__", { timeout: 120000 });
await page.evaluate(() => window.__PW_PUMP__(30));
const info = await page.evaluate(() => {
  const e = window.__AURA3D_SHOWCASE_PATROL_WING__;
  const c = document.querySelector("canvas");
  const cs = c ? getComputedStyle(c) : null;
  return {
    state: e.state, pos: e.position, heading: e.heading, airspeed: e.airspeed, altitude: e.altitude,
    cam: e.camera ?? null, nodes: e.sceneStats ?? null,
    canvasW: c?.width, canvasH: c?.height, cssW: c?.style?.width ?? cs?.width, cssH: c?.style?.height ?? cs?.height,
    canvasOpacity: cs?.opacity, canvasZ: cs?.zIndex, canvasPos: cs?.position, canvasVis: cs?.visibility,
    rect: c?.getBoundingClientRect()?.toJSON(),
    diagErrs: e.diagnostics?.errors?.slice(0,3) ?? [],
    backend: e.backend ?? e.diagnostics?.backend,
  };
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
console.log("ERRS:", JSON.stringify(errs.slice(0,10)));
await browser.close();
