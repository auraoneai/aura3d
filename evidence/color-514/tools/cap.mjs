// Real-GPU deterministic-clock capture. usage: node cap.mjs <url> <out.png> [--hdri-404] [--settle-ms=6000] [--frames=240] [--probe]
// Headless Chrome on the Metal GPU via loopback CDP; the virtual clock (shim.js, from lane/504-bellkeeper) replaces
// requestAnimationFrame/performance.now/Date.now, so game time only advances when this script steps a frame.
// --hdri-404 answers every /hdri/*.hdr request with 404 (the "HDRI file removed" case).
// --probe also prints app.diagnostics() warnings and hdri status of window.__probe, and the page console errors.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [url, out] = [process.argv[2], process.argv[3]];
const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split("=")[1]) : d; };
const SETTLE = opt("settle-ms", 6000), FRAMES = opt("frames", 240);
const port = 9700 + Math.floor(Math.random() * 250);
const W = 1280, H = 720;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/c514-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const consoleLines = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) consoleLines.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400)}`);
  if (d.method === "Fetch.requestPaused") {
    const u = d.params.request.url;
    if (flag("hdri-404") && /\/hdri\/[^/]+\.hdr/.test(u)) send("Fetch.fulfillRequest", { requestId: d.params.requestId, responseCode: 404, responseHeaders: [{ name: "Content-Type", value: "text/plain" }], body: Buffer.from("Not Found").toString("base64") });
    else send("Fetch.continueRequest", { requestId: d.params.requestId });
  }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
await send("Page.enable"); await send("Runtime.enable");
if (flag("hdri-404")) await send("Fetch.enable", { patterns: [{ urlPattern: "*/hdri/*", requestStage: "Request" }] });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
await send("Page.navigate", { url });
const dt = 1000 / 60;
const t0 = Date.now();
// Real-time settle: step one virtual frame per ~16 ms of wall time so async asset/probe loads land while the app is "running".
while (Date.now() - t0 < SETTLE) { await ev(`window.__vt && window.__vt.frame(${dt})`).catch(() => {}); await sleep(16); }
for (let i = 0; i < FRAMES; i++) await ev(`window.__vt.frame(${dt})`);
await sleep(250);
for (let i = 0; i < 30; i++) await ev(`window.__vt.frame(${dt})`);
let probeInfo = null;
if (flag("probe")) {
  probeInfo = await ev(`(async () => { const a = window.__probe; if (!a) return null; await a.ready(); const d = await a.diagnostics(); const text = JSON.stringify(d); const m = text.match(/LOOK_HDRI_MISSING[^"]{0,120}/); return { hasLookHdriMissing: !!m, snippet: m ? m[0] : null, keys: Object.keys(d).slice(0, 40) }; })()`).catch((e) => ({ error: String(e) }));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(JSON.stringify({ out, probeInfo, console: consoleLines.slice(0, 8) }));
ws.close(); chrome.kill(); process.exit(0);
