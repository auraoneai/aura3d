// Real-GPU probe for audit rows IC-07, LIVE-1 and P-3, run on an NVIDIA VM against production.
// Prints one JSON line per sample (RG <json>) and writes small JPEGs to ./out for retrieval.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "https://aura3d.auraone.ai";
const only = (process.argv[2] || "ic07,live1,p3").split(",");
mkdirSync("out", { recursive: true });
const log = (o) => console.log("RG " + JSON.stringify(o));
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--headless=new", "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--use-gl=angle", "--enable-features=Vulkan", "--disable-vulkan-surface", "--enable-precise-memory-info", "--js-flags=--expose-gc"]
});

async function page(url, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  let crashed = false;
  p.on("crash", () => { crashed = true; });
  await p.goto(BASE + url, { waitUntil: "load", timeout: 120000 });
  return { ctx, p, errors, crashedRef: () => crashed };
}
const gpu = (p) => p.evaluate(() => {
  const c = document.createElement("canvas"); const gl = c.getContext("webgl2");
  if (!gl) return "NO_WEBGL2"; const e = gl.getExtension("WEBGL_debug_renderer_info");
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
const lumaStats = (p) => p.evaluate(() => {
  const cv = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!cv) return null;
  const W = 240, H = Math.round(240 * cv.height / cv.width);
  const t = document.createElement("canvas"); t.width = W; t.height = H;
  const x = t.getContext("2d"); x.drawImage(cv, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data; let s = 0, c = 0, sc = 0, cc = 0, sb = 0, cb = 0;
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    const k = (y * W + i) * 4; const l = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]; s += l; c++;
    const centre = i > W / 3 && i < 2 * W / 3 && y > H / 3 && y < 2 * H / 3;
    if (centre) { sc += l; cc++; } else { sb += l; cb++; }
  }
  return { mean: +(s / c).toFixed(1), centre: +(sc / cc).toFixed(1), border: +(sb / cb).toFixed(1) };
});
const shot = async (p, name) => { await p.screenshot({ path: `out/${name}.jpg`, type: "jpeg", quality: 55, scale: "css" }); };

if (only.includes("ic07")) {
  // IC-07: runtime effects on (?vfx=on) with the debug hook, CPU-vs-CPU demo bout, 3 minutes.
  const { ctx, p, errors } = await page("/apps/showcase-iron-crown/?vfx=on&vfxdebug=1&autoplay=1");
  log({ row: "IC-07", gpu: await gpu(p) });
  await p.waitForTimeout(12000);
  let maxEmitters = 0, maxParticles = 0, maxAgeS = 0, lingerHits = 0;
  for (let i = 0; i < 36; i++) {
    await p.waitForTimeout(5000);
    const v = await p.evaluate(() => {
      const dbg = typeof window.__AURA_VFX_DEBUG__ === "function" ? window.__AURA_VFX_DEBUG__() : null;
      const apps = window.__AURA3D_LIVE_APPS__?.all?.() ?? [];
      const diag = apps.map((a) => a.diagnostics?.()).filter(Boolean);
      const codes = JSON.stringify(diag).match(/VFX_[A-Z_]+/g) ?? [];
      return { dbg, codes: [...new Set(codes)] };
    });
    const list = Array.isArray(v.dbg) ? v.dbg : (v.dbg?.emitters ?? []);
    const particles = list.reduce((a, e) => a + (e.particles ?? e.alive ?? e.count ?? 0), 0);
    const age = list.reduce((a, e) => Math.max(a, e.ageS ?? e.age ?? 0), 0);
    maxEmitters = Math.max(maxEmitters, list.length); maxParticles = Math.max(maxParticles, particles); maxAgeS = Math.max(maxAgeS, age);
    if (v.codes.some((c) => /LINGERING|UNSTOPPED/.test(c))) lingerHits++;
    log({ row: "IC-07", t: (i + 1) * 5, emitters: list.length, particles, maxAge: age, codes: v.codes, sample: list.slice(0, 3) });
    if (i % 6 === 2) await shot(p, `ic07-${i}`);
  }
  log({ row: "IC-07", summary: { maxEmitters, maxParticles, maxAgeS, lingerHits, errors: errors.slice(0, 10) } });
  await ctx.close();
}

if (only.includes("live1")) {
  // LIVE-1: Aura Diamond autoplay for 15 minutes, switching park every 150 s by reload, heap and crash watch.
  const parks = ["sandlot", "skyline", "canyon", "ivy", "dome", "lunar"];
  const { ctx, p, errors, crashedRef } = await page(`/apps/showcase-aura-diamond-3d/?autoplay=1&park=${parks[0]}`);
  log({ row: "LIVE-1", gpu: await gpu(p) });
  const t0 = Date.now(); let i = 0, maxHeap = 0;
  while (Date.now() - t0 < 15 * 60 * 1000 && !crashedRef()) {
    await p.waitForTimeout(30000);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (elapsed > 0 && Math.floor(elapsed / 150) > Math.floor((elapsed - 30) / 150)) {
      const park = parks[Math.floor(elapsed / 150) % parks.length];
      await p.goto(`${BASE}/apps/showcase-aura-diamond-3d/?autoplay=1&park=${park}`, { waitUntil: "load", timeout: 120000 }).catch((e) => errors.push("nav " + e.message));
      log({ row: "LIVE-1", t: elapsed, switchedTo: park });
    }
    const m = await p.evaluate(() => ({ heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, href: location.href, canvases: document.querySelectorAll("canvas").length })).catch((e) => ({ evalError: e.message }));
    maxHeap = Math.max(maxHeap, m.heapMB ?? 0);
    log({ row: "LIVE-1", t: elapsed, ...m, crashed: crashedRef(), luma: await lumaStats(p).catch(() => null) });
    if (i++ % 6 === 0) await shot(p, `live1-${elapsed}`).catch(() => {});
  }
  log({ row: "LIVE-1", summary: { minutes: +((Date.now() - t0) / 60000).toFixed(1), maxHeapMB: maxHeap, crashed: crashedRef(), errors: errors.slice(0, 10) } });
  await ctx.close();
}

if (only.includes("p3")) {
  // P-3: Serpentine Sky Run in a live run; runner-centre vs border luma on a real GPU.
  const { ctx, p, errors } = await page("/apps/serpentine-sky-run/?autostart=1");
  log({ row: "P-3", gpu: await gpu(p) });
  await p.waitForTimeout(8000);
  await p.keyboard.press("Space").catch(() => {});
  const rows = [];
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(4000);
    const s = await lumaStats(p); rows.push(s); log({ row: "P-3", t: (i + 1) * 4, ...s });
    if (i === 3 || i === 7) await shot(p, `p3-${i}`);
  }
  const avg = (k) => +(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
  log({ row: "P-3", summary: { centre: avg("centre"), border: avg("border"), gap: +(avg("centre") - avg("border")).toFixed(1), errors: errors.slice(0, 10) } });
  await ctx.close();
}
await browser.close();
console.log("RG_DONE");
