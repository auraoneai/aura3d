// Real-GPU no-regression capture for the R-02 compile-path change: headless Chrome over loopback CDP (no Playwright),
// deterministic virtual clock (shim.js, from lane/504-bellkeeper evidence/bellkeeper-504/tools/shim.js).
// usage: node game-cap.mjs <baseUrl> <outDir> <label> <slug>[,<slug>...] [settleFrames=180]
// For each game: load /apps/<slug>/ with the shim, step the virtual clock (60 Hz) while real time lets assets load,
// wait for route readiness, then step <settleFrames> more frames and screenshot <label>-<slug>.png.
// Also records the route's page globals (compile evidence must still be published for full-page routes).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [base, outDir, label, slugList] = process.argv.slice(2);
const settleFrames = Number(process.argv[6] ?? 180);
if (!base || !outDir || !label || !slugList) throw new Error("usage: game-cap.mjs <baseUrl> <outDir> <label> <slugs> [settleFrames]");
fs.mkdirSync(outDir, { recursive: true });
const shim = fs.readFileSync(path.join(here, "shim.js"), "utf8");
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
for (const slug of slugList.split(",")) {
  const port = 9700 + Math.floor(Math.random() * 250);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "r02-game-"));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: shim });
    const url = `${base}/apps/${slug}/`;
    await send("Page.navigate", { url });
    const dt = 1000 / 60;
    let ready = false; let frames = 0; const started = Date.now();
    while (!ready && Date.now() - started < 90_000) {
      ready = await ev(`(window.__vt && window.__vt.frame(${dt}), document.body && document.body.dataset.aura3dReady === "true")`).catch(() => false);
      frames++;
      await sleep(frames < 100 ? 40 : 15);
    }
    // Let async asset decodes land in real time, then advance the deterministic clock.
    await sleep(2500);
    for (let i = 0; i < settleFrames; i++) await ev(`window.__vt.frame(${dt})`).catch(() => undefined);
    await sleep(800);
    await ev(`window.__vt.frame(${dt})`).catch(() => undefined);
    await sleep(400);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, `${label}-${slug}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    const page = await ev(`({ href: location.href, title: document.title, canvases: document.querySelectorAll("canvas").length,
      ready: document.body.dataset.aura3dReady ?? null, drawCalls: document.body.dataset.aura3dDrawCalls ?? null,
      globals: Object.getOwnPropertyNames(window).filter((k) => /^__(A3D|AURA)/.test(k)).sort(),
      tapTier: window.__A3D_SHADOW_TAP_TIER__ ?? null, denseCap: window.__A3D_DENSE_SHADOW_CAP__ ?? null,
      proxies: Array.isArray(window.__A3D_SHADOW_PROXIES__) ? window.__A3D_SHADOW_PROXIES__.length : null })`).catch((e) => ({ error: String(e) }));
    results.push({ slug, label, file: path.basename(file), readyAfterPolls: frames, routeReady: ready, page });
    console.error(slug, label, ready, JSON.stringify(page).slice(0, 300));
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(outDir, `${label}.json`), `${JSON.stringify(results, null, 2)}\n`);
