// Real-GPU deterministic capture of the frame-514 before/after pages (headless Chrome, ANGLE/Metal, virtual clock shim).
// usage: node capture.mjs <distDir> <outDir> <id> [id...]     e.g. node capture.mjs /tmp/frame514/dist evidence/frame-514/frames clock-before clock-after
// For every id: two independent loads (run1, run2). run1 is written as <id>.png; the mean abs diff run1 vs run2 is the same-build noise floor.
// Writes <outDir>/<id>.json with the measured subject fraction (larger of projected height/width, 16:9), luminance stats and a real-frame check.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [distDir, outDir, ...ids] = process.argv.slice(2);
const W = 640, H = 360, DPR = 2, FRAMES = Number(process.env.FRAMES || 120), DT = 1000 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".glb": "model/gltf-binary", ".json": "application/json", ".wasm": "application/wasm" };

const server = http.createServer((req, res) => {
  const file = path.join(distDir, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function captureOnce(id) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync("/tmp/f514-chrome-");
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
    const consoleErrors = [];
    await send("Page.enable"); await send("Runtime.enable");
    const prev = ws.onmessage;
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") consoleErrors.push(d.params.exceptionDetails.text); if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)); prev(m); };
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
    await send("Page.navigate", { url: `${origin}/${id}/index.html` });
    let ready = false;
    for (let i = 0; i < 3000 && !ready; i++) {
      ready = await ev(`(window.__vt.frame(${DT}), !!(window.__EVAL_READY__ || window.__TASK_READY__))`).catch(() => false);
      if (!ready) await sleep(i < 50 ? 50 : 8);
    }
    if (!ready) throw new Error(`${id}: page never became ready`);
    for (let i = 0; i < FRAMES; i++) { await ev(`window.__vt.frame(${DT})`); if (i % 10 === 9) await sleep(5); }
    const info = await ev(`(() => { const c = document.querySelector("canvas#app"); return { title: document.title, canvas: !!c, cw: c && c.width, ch: c && c.height, f514: window.__f514 ? { fill: window.__f514.measure(${W} / ${H}), bounds: window.__f514.bounds(), pose: window.__f514.pose() } : null, vt: window.__vt.now }; })()`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    ws.close();
    return { png: shot.result.data, info, consoleErrors };
  } finally { chrome.kill(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {} }
}

// Decode two PNGs in a throwaway page and compute: mean abs diff (RGB, 0..255) and luminance statistics for the first.
async function analyse(pngA, pngB) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync("/tmp/f514-chrome-");
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const expr = `(async () => {
      const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + d; });
      const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const a = px(await load(${JSON.stringify(pngA)})), b = px(await load(${JSON.stringify(pngB)}));
      let diff = 0, lum = 0, dark = 0, n = a.length / 4;
      const bins = new Set();
      for (let i = 0; i < a.length; i += 4) { diff += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; const l = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; lum += l; if (l < 8) dark++; bins.add((a[i] >> 4) * 256 + (a[i + 1] >> 4) * 16 + (a[i + 2] >> 4)); }
      return { meanAbsDiff: diff / n, meanLuma: lum / n, nearBlackFraction: dark / n, distinctColours16: bins.size, pixels: n };
    })()`;
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    ws.close();
    return r.result.result.value;
  } finally { chrome.kill(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {} }
}

fs.mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  const a = await captureOnce(id);
  const b = await captureOnce(id);
  const stats = await analyse(a.png, b.png);
  const real = a.info.canvas && !/marketing|aura3d\s*\|/i.test(a.info.title) && stats.nearBlackFraction < 0.98 && stats.distinctColours16 > 8;
  fs.writeFileSync(path.join(outDir, `${id}.png`), Buffer.from(a.png, "base64"));
  const record = { id, viewport: `${W}x${H}@${DPR}x`, virtualFramesStepped: FRAMES, virtualNowMs: a.info.vt, title: a.info.title, canvasPresent: a.info.canvas, subjectFill: a.info.f514?.fill ?? null, subjectFillRun2: b.info.f514?.fill ?? null, bounds: a.info.f514?.bounds ?? null, pose: a.info.f514?.pose ?? null, sameBuildNoiseMeanAbsDiff: stats.meanAbsDiff, meanLuma: stats.meanLuma, nearBlackFraction: stats.nearBlackFraction, distinctColours16: stats.distinctColours16, realGameFrame: real, consoleErrors: [...new Set([...a.consoleErrors, ...b.consoleErrors])].slice(0, 5) };
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
}
server.close();
process.exit(0);
