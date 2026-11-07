// Real-GPU deterministic frame capture (E3-06). usage: node cap.mjs <outDir> <tag> <name=url> [name=url ...]
// Headless Chrome (Metal GPU) over loopback CDP, virtual clock shim (lane/504-bellkeeper shim.js, copied as shim.js).
// The caller holds /tmp/a3d-rea.lock around the run. Every capture writes <outDir>/<name>.<tag>.png plus a verdict row
// (title, url, canvas count, WebGL renderer, mean luminance, luminance stddev, distinct colours) so a black frame or a
// marketing page cannot pass as a game frame.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir, tag, ...targets] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1280, H = 720, DT = 1000 / 60;
const rows = [];
setTimeout(() => { console.error('watchdog exit'); process.exit(2); }, 420000).unref();
for (const spec of targets) {
  const [name, url] = [spec.slice(0, spec.indexOf("=")), spec.slice(spec.indexOf("=") + 1)];
  const port = 9700 + Math.floor(Math.random() * 250);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/a3d515-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  let targetsJson;
  for (let i = 0; i < 60; i++) { try { targetsJson = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targetsJson.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const ws = new WebSocket(targetsJson.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
  await send("Page.navigate", { url });
  const proof = url.includes("/proof/");
  // Readiness: proof pages signal __PROOF_READY__. Games have no common hook, so poll the largest canvas region of a
  // screenshot until it holds real content (>= 250 distinct 5-bit colours), stepping virtual frames between polls.
  const canvasStat = async () => {
    const rect = await ev(`(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.width, ${W}), h: Math.min(r.height, ${H}) }; })()`).catch(() => null);
    if (!rect || rect.w < 50 || rect.h < 50) return { colours: 0 };
    const s0 = await send("Page.captureScreenshot", { format: "png", clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 0.25 } });
    return ev(`(async () => { const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${s0.result.data}"; }); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3); return { colours: set.size }; })()`).catch(() => ({ colours: 0 }));
  };
  let ready = false, polls = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    for (let i = 0; i < 20; i++) await ev(`window.__vt && window.__vt.frame(${DT})`).catch(() => {});
    if (proof) ready = await ev("!!window.__PROOF_READY__").catch(() => false);
    else if (Date.now() - t0 > 8000 && ++polls % 3 === 0) ready = (await canvasStat()).colours >= 250;
    if (ready) break;
    await sleep(150);
  }
  // settle: a fixed number of virtual frames
  for (let i = 0; i < (proof ? 12 : 240); i++) { await ev(`window.__vt.frame(${DT})`).catch(() => {}); if (i % 30 === 0) await sleep(30); }
  if (proof) await ev("(async()=>{ for (let i=0;i<6;i++) window.__PROOF_APP__.step(1/60); })()");
  // Retry the screenshot while the frame itself is still blank (the compositor can lag under machine load).
  const colourCount = (data) => ev(`(async () => { const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${data}"; }); const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 320, 180); const d = g.getImageData(0, 0, 320, 180).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3); return set.size; })()`).catch(() => 0);
  let shot;
  if (proof) {
    // Static proof scenes: converge (async env / shadow / texture work finishes in real time), three identical shots in a row.
    let prev = "", same = 0;
    for (let i = 0; i < 160 && same < 3; i++) {
      await ev("(async()=>{ window.__PROOF_APP__.step(1/60); })()").catch(() => {});
      await sleep(150);
      const t = await send("Page.captureScreenshot", { format: "png" });
      const populated = (await colourCount(t.result.data)) >= 20; // blank = shader programs still compiling under load
      same = populated && t.result.data === prev ? same + 1 : 0; prev = t.result.data; shot = t;
    }
    console.error(name, tag, same >= 3 ? "converged" : "WARNING frame did not converge");
  }
  for (let attempt = 0; !proof && attempt < 12; attempt++) {
    if (proof) await ev("(async()=>{ window.__PROOF_APP__.step(1/60); })()").catch(() => {});
    else for (let i = 0; i < 5; i++) await ev(`window.__vt.frame(${DT})`).catch(() => {});
    shot = await send("Page.captureScreenshot", { format: "png" });
    if ((await colourCount(shot.result.data)) >= (proof ? 20 : 150)) break;
    await sleep(500);
  }
  fs.writeFileSync(path.join(outDir, `${name}.${tag}.png`), Buffer.from(shot.result.data, "base64"));
  const verdict = await ev(`(async () => {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64,${shot.result.data}"; });
    const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 320, 180);
    const d = g.getImageData(0, 0, 320, 180).data; let s = 0, s2 = 0; const set = new Set();
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3); }
    const N = d.length / 4, mean = s / N, sd = Math.sqrt(Math.max(0, s2 / N - mean * mean));
    const cv = [...document.querySelectorAll("canvas")]; let gl = null;
    for (const el of cv) { try { const x = el.getContext("webgl2") || el.getContext("webgl"); if (x) { const e = x.getExtension("WEBGL_debug_renderer_info"); gl = e ? x.getParameter(e.UNMASKED_RENDERER_WEBGL) : "webgl"; break; } } catch {} }
    return { title: document.title, href: location.href, canvases: cv.length, gl, mean: +mean.toFixed(2), sd: +sd.toFixed(2), colours: set.size, bodyText: (document.body.innerText || "").slice(0, 80) };
  })()`).catch((e) => ({ error: String(e) }));
  const diag = proof ? await ev("(() => { const d = window.__PROOF_APP__.diagnostics(); return JSON.stringify({ backend: d.backend, errors: d.errors, drawCalls: d.drawCalls, frames: d.frameCount ?? d.frames, warnings: d.warnings }); })()").catch((e) => String(e)) : undefined;
  rows.push({ name, tag, url, readyDetected: ready, diag, ...verdict });
  console.error(name, tag, JSON.stringify(verdict));
  ws.close(); chrome.kill(); await sleep(400);
  fs.writeFileSync(path.join(outDir, `verdicts.${tag}.${rows.length === 1 ? name : "set"}.json`), JSON.stringify(rows, null, 1));
}
fs.writeFileSync(path.join(outDir, `verdicts.${tag}.json`), JSON.stringify(rows, null, 1));
process.exit(0);
