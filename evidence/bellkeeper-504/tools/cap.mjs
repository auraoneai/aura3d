// Real-GPU frame strip of the hero walking. usage: node cap.mjs <hz> <follow|side|back|full> <out.png> [url] [frames=8] [crop]
// Virtual clock (shim.js) at <hz>; ArrowRight is held; after a settle, <frames> screenshots are taken evenly across one Walk cycle (1.0667 s).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [hz, preset, out] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const base = "http://127.0.0.1:8504/apps/showcase-where-the-wind-wanders-port/?start=1";
const url = process.argv[5] || (preset === "follow" ? base : `${base}&camview=${preset}`);
const N = Number(process.argv[6] || 8);
const CROP = (process.argv[7] || "").split(",").map(Number);
const KEYS = process.env.KEYS || "ArrowRight";
const port = 9600 + Math.floor(Math.random() * 300);
const W = 1280, H = 720;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/bk504-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
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
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
await send("Page.navigate", { url });
const dt = 1000 / hz;
for (let i = 0; i < 4000; i++) {
  const ready = await ev(`(window.__vt.frame(${dt}), !!(window.__AURA_WIND__ && window.__AURA_WIND__.ready && window.__AURA_WIND__.ready()))`).catch(() => false);
  if (ready) break; await sleep(i < 50 ? 50 : 5);
}
// camera preset: the game's capture-only ?camview=side|back|three (follow = the default owner view)
for (let i = 0; i < Math.round(hz * 1.5); i++) await ev(`window.__vt.frame(${dt})`);
const press = (type) => ev(`window.dispatchEvent(new KeyboardEvent("${type}", { code: "${KEYS}", key: "${KEYS}", bubbles: true, cancelable: true }))`);
await press("keydown");
for (let i = 0; i < Math.round(hz * 2.5); i++) await ev(`window.__vt.frame(${dt})`);
const cycle = 1.0667, shots = [], info = [];
let t = 0;
for (let k = 0; k < N; k++) {
  const target = (k * cycle) / N;
  while (t + dt / 2000 < target) { await ev(`window.__vt.frame(${dt})`); t += dt / 1000; }
  const p = { format: "png" }; if (CROP.length === 4 && !CROP.some(Number.isNaN)) p.clip = { x: CROP[0], y: CROP[1], width: CROP[2], height: CROP[3], scale: 2 };
  const s = await send("Page.captureScreenshot", p);
  shots.push(s.result.data);
  info.push(await ev(`(() => { const r = window.__AURA_WIND__.heroRig(); return r && r.animation && [r.animation.clip, +r.animation.captureTime.toFixed(3)]; })()`));
}
console.error("frames", JSON.stringify(info));
// stitch in-page
const strip = await ev(`(async () => { const imgs = await Promise.all(${JSON.stringify(shots)}.map((d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + d; })));
  const cols = Math.min(imgs.length, 4), rows = Math.ceil(imgs.length / cols); const c = document.createElement("canvas"); c.width = imgs[0].width * cols; c.height = imgs[0].height * rows; const g = c.getContext("2d");
  imgs.forEach((im, i) => g.drawImage(im, (i % cols) * im.width, Math.floor(i / cols) * im.height)); return c.toDataURL("image/png").split(",")[1]; })()`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(strip, "base64"));
ws.close(); chrome.kill(); process.exit(0);
