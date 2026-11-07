// Real-GPU (headless Chrome, Metal, loopback CDP) frame of a page under a virtual clock.
// usage: node cap.mjs <url> <out.png> [warmFrames=900] [extraFrames=120]
// Frames advance 1/60 s each; the first <warmFrames> are paced with real sleeps so async asset loads finish, then
// <extraFrames> more run back to back and the screenshot is taken.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [url, out] = [process.argv[2], process.argv[3]];
const WARM = Number(process.argv[4] || 900), EXTRA = Number(process.argv[5] || 120);
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), dt = 1000 / 60;
// Chrome picks its own free debugging port and writes it to DevToolsActivePort in a fresh per-run profile. The old
// random port from a range shared with other concurrent capture lanes let a run attach to ANOTHER lane's Chrome and
// screenshot its page: that is how the first heatsink "base2" frame came out as a different game.
const profile = fs.mkdtempSync("/tmp/fx516-chrome-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port;
for (let i = 0; i < 100 && !port; i++) { try { port = Number(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]) || undefined; } catch {} if (!port) await sleep(100); }
if (!port) { chrome.kill(); throw new Error("Chrome did not report a DevTools port"); }
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
try {
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
  await send("Page.navigate", { url });
  await sleep(1500);
  for (let i = 0; i < WARM; i++) { await ev(`window.__vt && window.__vt.frame(${dt})`).catch(() => {}); await sleep(i < 200 ? 20 : 8); }
  for (let i = 0; i < EXTRA; i++) await ev(`window.__vt.frame(${dt})`).catch(() => {});
  const title = await ev("document.title + ' | ' + location.pathname");
  // Refuse to write a frame of any page other than the one requested.
  const want = new URL(url).pathname.replace(/index\.html$/, "");
  const got = String(await ev("location.pathname")).replace(/index\.html$/, "");
  if (!got.startsWith(want)) throw new Error(`captured page ${got} is not the requested ${want}`);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(s.result.data, "base64"));
  console.log(JSON.stringify({ out, title }));
} finally { ws.close(); chrome.kill(); }
await sleep(800);
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
