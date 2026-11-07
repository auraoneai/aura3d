// usage: node drive.mjs <hz> <seconds> <outJson> [url]
import { spawn } from "node:child_process";
import fs from "node:fs";
const [hz, secs, out, urlArg] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5]];
const port = 9300 + Math.floor(Math.random() * 500);
const url = urlArg || "http://127.0.0.1:8504/apps/showcase-where-the-wind-wanders-port/?start=1";
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/bk504-chrome-${port}`, "--window-size=960,540", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync("/tmp/bk504-tools/shim.js", "utf8") });
await send("Page.navigate", { url });
const dt0 = 1000 / hz;
const mode = process.argv[6] || "uniform";
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
let dropN = 0;
const dtFor = () => { if (mode === "jitter") return dt0 * (0.6 + 0.8 * rnd()); if (mode === "drop") return ++dropN % 7 === 0 ? dt0 * 2 : dt0; if (mode === "stepsync") return rnd() < 0.5 ? dt0 * 0.1 : dt0 * 1.9; return dt0; };
let dt = dt0;
// warm up: run frames in real time until ready
for (let i = 0; i < 4000; i++) {
  const ready = await ev(`(window.__vt.frame(${dt}), !!(window.__AURA_WIND__ && window.__AURA_WIND__.ready && window.__AURA_WIND__.ready()))`).catch(() => false);
  if (ready) break; await sleep(i < 50 ? 50 : 5);
}
for (let i = 0; i < Math.round(hz * 1.5); i++) await ev(`window.__vt.frame(${dt})`);
const probe = `(() => { const q = window.__AURA_WIND__; const r = q.heroRig(); return { t: window.__vt.now, sim: q.state(), rig: r }; })()`;
console.error("probe", JSON.stringify(await ev(probe)).slice(0, 900));
const frames = [];
const total = Math.round(hz * secs);
const KEYS = (process.env.KEYS || "ArrowRight").split("+");
const press = async (type) => { for (const k of KEYS) await ev(`(() => { const e = new KeyboardEvent("${type}", { code: "${k}", key: "${k}", bubbles: true, cancelable: true }); window.dispatchEvent(e); })()`); };
const shotAt = new Set(process.env.SHOTS ? process.env.SHOTS.split(',').map((s) => Math.round((Number(s) + 1.0) * hz)) : [0.25, 0.5, 0.75, 1.0, 1.25, 1.5].map((s) => Math.round((s + 1.0) * hz)));
fs.mkdirSync(out + ".shots", { recursive: true });
for (let i = 0; i < total; i++) {
  if (i === Math.round(hz * 1.0)) await press("keydown");
  if (i === Math.round(hz * (secs - 1.5))) await press("keyup");
  dt = dtFor(); await ev(`window.__vt.frame(${dt})`);
  frames.push(await ev(probe));
  if (shotAt.has(i)) { const s = await send("Page.captureScreenshot", { format: "png", clip: { x: 380, y: 230, width: 200, height: 220, scale: 1 } }); fs.writeFileSync(`${out}.shots/${i}.png`, Buffer.from(s.result.data, "base64")); }
}
fs.writeFileSync(out, JSON.stringify({ hz, frames }));
ws.close(); chrome.kill();
process.exit(0);
