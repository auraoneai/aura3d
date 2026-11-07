// Real-GPU deterministic capture through loopback CDP to headless Chrome (ANGLE/Metal), virtual clock from shim.js.
// usage: node cap.mjs <url> <outPrefix> [times=1,3] [readyExpr] [W=640] [H=360]
// Writes <outPrefix>-<n>.png per time and prints a JSON line: title, console errors, mean rgb, canvas count.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [url, outPrefix, timesArg = "1,3", readyExpr = "window.__EVAL_READY__ === true", wArg = "640", hArg = "360"] = process.argv.slice(2);
const times = timesArg.split(",").map(Number);
const W = Number(wArg), H = Number(hArg);
const port = 9514 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/e514-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
  else if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) errors.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
await send("Page.navigate", { url });
const dt = 1000 / 60;
let ready = false;
for (let i = 0; i < 6000 && !ready; i++) { ready = await ev(`(window.__vt.frame(${dt}), !!(${readyExpr}))`).catch(() => false); await sleep(i < 50 ? 50 : 8); }
if (!ready) { console.log(JSON.stringify({ url, error: "not ready", errors })); ws.close(); chrome.kill(); process.exit(2); }
// Real-time settle while stepping frames: lets async asset loads finish before the timed captures.
const settle = Number(process.env.SETTLE_MS ?? 0);
for (const t0 = Date.now(); Date.now() - t0 < settle;) { await ev(`window.__vt.frame(${dt})`); await sleep(16); }
// Fixed frame count (deterministic game time) with a real-time pause per frame so async loads can land.
for (let i = 0; i < Number(process.env.SETTLE_FRAMES ?? 0); i++) { await ev(`window.__vt.frame(${dt})`); await sleep(Number(process.env.SETTLE_PAUSE ?? 30)); }
let t = 0; const stats = [];
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
for (const [k, target] of times.entries()) {
  while (t < target) { await ev(`window.__vt.frame(${dt})`); t += dt / 1000; }
  await sleep(120);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${outPrefix}-${k + 1}.png`, Buffer.from(s.result.data, "base64"));
  stats.push(await ev(`(async () => { const i = new Image(); await new Promise((r) => { i.onload = r; i.src = "data:image/png;base64,${s.result.data}"; }); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, gg = 0, b = 0; for (let p = 0; p < d.length; p += 4) { r += d[p]; gg += d[p + 1]; b += d[p + 2]; } const m = d.length / 4; return [Math.round(r / m), Math.round(gg / m), Math.round(b / m)]; })()`));
}
const meta = await ev(`JSON.stringify({ title: document.title, canvases: document.querySelectorAll("canvas").length, scene: window.__A514__ && window.__A514__.scene })`);
console.log(JSON.stringify({ url, meta: JSON.parse(meta), meanRgb: stats, errors }));
ws.close(); chrome.kill(); process.exit(0);
