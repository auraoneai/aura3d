// Real-GPU evidence for the React embedding host demo: headless Chrome over loopback CDP (no Playwright).
// Usage: node examples/react-embedding-host/tools/capture.mjs <baseUrl> <outDir>
// Writes frame-a.png / frame-b.png (value 0.10 and 0.60), and evidence.json with page-global checks,
// counters, per-canvas luminance (not black) and the mean absolute difference between the two frames.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const [base, outDir] = [process.argv[2], process.argv[3]];
if (!base || !outDir) throw new Error("usage: capture.mjs <baseUrl> <outDir>");
mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "react515-chrome-"));
const proc = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1000,700",
  "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--no-first-run", "--hide-scrollbars", "about:blank"
], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === "page")) break; } catch { /* retry */ }
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/examples/react-embedding-host/index.html?live=0&value=0.1` });
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) { await sleep(400); ready = await evaluate("Boolean(window.__EMBED_HOST__ && window.__EMBED_HOST__.ready())").catch(() => false); }
  if (!ready) throw new Error("host never reported two live apps");
  const settle = () => evaluate("new Promise((resolve) => { let n = 0; const tick = () => (++n >= 30 ? resolve(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); })");
  await settle(); await sleep(1500);
  const gpu = await evaluate("(() => { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null; })()");
  const rects = await evaluate("[...document.querySelectorAll('canvas')].map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })");
  const shot = async (name) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = join(outDir, name);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };
  const crop = async (file, rect) => (await sharp(file).extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const stats = (buffer) => {
    let sum = 0; let min = 255; let max = 0;
    for (let i = 0; i < buffer.length; i += 3) { const l = (buffer[i] + buffer[i + 1] + buffer[i + 2]) / 3; sum += l; min = Math.min(min, l); max = Math.max(max, l); }
    return { meanLuma: +(sum / (buffer.length / 3)).toFixed(2), min, max };
  };
  const fileA = await shot("frame-a.png");
  await evaluate("window.__EMBED_HOST__.setValue(0.6)");
  await settle(); await sleep(800);
  const fileB = await shot("frame-b.png");
  // Static control: a second capture of the same state measures GPU/compositor noise.
  await settle();
  const fileB2 = await shot("frame-b-repeat.png");
  const pageState = await evaluate(`({
    bodyAuraKeys: Object.keys(document.body.dataset).filter((k) => k.startsWith('aura3d')),
    routeReady: typeof window.__AURA3D_ROUTE_READY__,
    liveApps: typeof globalThis.__AURA3D_LIVE_APPS__,
    counters: window.__EMBED_HOST__.counters,
    canvases: document.querySelectorAll('canvas').length,
    tabIndex: [...document.querySelectorAll('canvas')].map((c) => c.tabIndex)
  })`);
  const regions = [];
  for (const [index, rect] of rects.entries()) {
    const [a, b, b2] = await Promise.all([crop(fileA, rect), crop(fileB, rect), crop(fileB2, rect)]);
    const mad = (x, y) => { let sum = 0; for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]); return +(sum / x.length).toFixed(4); };
    regions.push({ canvas: index === 0 ? "A (handle.update, props)" : "B (useAuraNodeUpdate)", rect, frameA: stats(a), frameB: stats(b), meanAbsDiffAtoB: mad(a, b), meanAbsDiffBtoBRepeat: mad(b, b2) });
  }
  const evidence = { base, gpuRenderer: gpu, rects, pageState, regions, verdicts: {
    notBlack: regions.every((r) => r.frameA.max > 40 && r.frameA.meanLuma > 8 && r.frameB.max > 40),
    notMarketingPage: pageState.canvases === 2 && /react-embedding-host/.test(`${base}/examples/react-embedding-host/`),
    motion: regions.every((r) => r.meanAbsDiffAtoB > 5 * Math.max(r.meanAbsDiffBtoBRepeat, 0.01)),
    noPageGlobals: pageState.bodyAuraKeys.length === 0 && pageState.routeReady === "undefined" && pageState.liveApps === "undefined",
    noSetScene: pageState.counters.setScene === 0
  } };
  writeFileSync(join(outDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  ws.close();
} finally {
  proc.kill("SIGKILL");
}
