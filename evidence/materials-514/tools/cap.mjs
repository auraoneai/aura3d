// Real-GPU deterministic capture. usage: node cap.mjs <url> <out.png> [frames=90] [W=640] [H=360] [dtMs=16.667]
// Headless Chrome (Metal) via loopback CDP, virtual clock shim (shim.js), N virtual frames, then a PNG screenshot.
// Hold /tmp/a3d-rea.lock while running.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [url, out] = [process.argv[2], process.argv[3]];
const N = Number(process.argv[4] || 90), W = Number(process.argv[5] || 640), H = Number(process.argv[6] || 360), dt = Number(process.argv[7] || 1000 / 60);
const port = 9700 + Math.floor(Math.random() * 250);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/mat514-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Watchdog: a hung page must never keep the shared GPU lock.
setTimeout(() => { console.error("WATCHDOG: capture exceeded 150 s"); try { chrome.kill("SIGKILL"); } catch {} process.exit(2); }, 150000).unref();
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled" && process.env.CAP_CONSOLE) console.error("CONSOLE", d.params.type, (d.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  else if (d.method === "Runtime.exceptionThrown") logs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
await send("Page.navigate", { url });
await sleep(Number(process.env.CAP_SETTLE_MS || 1500));
// CAP_WAIT_READY=1: hold virtual time still (frame(0): callbacks run, performance.now does not move) until the largest WebGL
// canvas is lit, so slow asset loads on a busy machine cannot change how much game time the N measured frames cover.
if (process.env.CAP_WAIT_READY) {
  // CAP_WAIT_DT: games whose loader advances on frame time (never ready at dt 0) step 16.667 ms per probe instead.
  const probe = `(() => { window.__vt.frame(${Number(process.env.CAP_WAIT_DT || 0)}); const cs = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height); const c = cs[0]; if (!c) return -1;
    const gl = c.getContext("webgl2") || c.getContext("webgl"); if (!gl) return -2; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(4); let lit = 0, n = 0;
    for (let yy = 1; yy < 12; yy++) for (let xx = 1; xx < 16; xx++) { gl.readPixels(Math.floor(w * xx / 16), Math.floor(h * yy / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (Math.max(px[0], px[1], px[2]) > 12) lit++; } return lit / n; })()`;
  let stable = 0, last = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < Number(process.env.CAP_WAIT_MAX_MS || 110000) && stable < 4) { const v = await ev(probe).catch(() => -3); last = v; stable = v >= 0.2 ? stable + 1 : 0; await sleep(150); }
  console.error("READY", JSON.stringify({ lit: last, waitedMs: Date.now() - t0, stable }));
  if (stable < 4) { console.error("NOT_READY: canvas never lit; frame is not a valid game frame"); }
}
for (let i = 0; i < N; i++) { await ev(`window.__vt.frame(${dt})`).catch(() => {}); if (i < 40) await sleep(60); else if (i % 10 === 0) await sleep(20); }
await sleep(300);
for (let i = 0; i < 6; i++) { await ev(`window.__vt.frame(${dt})`).catch(() => {}); await sleep(50); }
const s = await send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(s.result.data, "base64"));
if (logs.length) console.error("EXCEPTIONS", logs.join("\n"));
ws.close(); chrome.kill(); process.exit(0);
