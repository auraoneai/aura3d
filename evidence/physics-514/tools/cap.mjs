// Deterministic real-GPU frame capture. usage: node cap.mjs <repoRoot> <distDir> <out.png> <query> <frames> [settleMs=8000]
// Loopback CDP to headless Chrome, virtual-clock shim (rAF held until settleMs so async loads finish, then <frames> frames of 1/60 s).
// env SHIM = path to shim.js. Holds /tmp/a3d-rea.lock only while capturing.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [repo, dist, out, query, framesArg, settleArg] = process.argv.slice(2);
const frames = Number(framesArg || 180), settle = Number(settleArg || 8000);
import http from "node:http";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".woff2": "font/woff2" };
// Serves <dist> first, then <repo>/public (the apps' publicDir; builds here skip copying its 1.3 GB).
function serveDirectory(root) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
      for (const base of [root, path.join(repo, "public")]) {
        const f = path.join(base, rel);
        if (!f.startsWith(base) || !fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
        res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
        return fs.createReadStream(f).pipe(res);
      }
      res.writeHead(404); res.end();
    }).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => s.close(r)) }));
  });
}
const shim = fs.readFileSync(process.env.SHIM, "utf8");
const server = await serveDirectory(dist);
const port = 9700 + Math.floor(Math.random() * 250);
const prof = `/tmp/fx517-physics-chrome-${port}`;
const W = 960, H = 540;
const lock = "/tmp/a3d-rea.lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ownLock = false;
while (true) { try { fs.mkdirSync(lock); ownLock = true; break; } catch { await sleep(250); } }
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const cleanup = async () => { try { chrome.kill(); } catch {} if (ownLock) { ownLock = false; try { fs.rmdirSync(lock); } catch {} } await server.close().catch(() => {}); await sleep(1000); try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch {} };
process.on("SIGINT", async () => { await cleanup(); process.exit(1); });
// Watchdog: a page that stops answering Runtime.evaluate must not hold the shared capture lock.
setTimeout(async () => { console.error("watchdog: capture exceeded 240 s"); await cleanup(); process.exit(2); }, 240000).unref();
try {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === "Runtime.exceptionThrown") errors.push("exception: " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)); };
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: shim });
  await send("Page.navigate", { url: `${server.url}/index.html${query ? "?" + query : ""}` });
  await sleep(settle);
  // optional KEYSEQ="Code:downFrame:upFrame" holds a key on window (deterministic by frame index)
  const [kc, kd, ku] = (process.env.KEYSEQ || "").split(":");
  const key = (type) => ev(`window.dispatchEvent(new KeyboardEvent("${type}", { code: "${kc}", key: "${kc}", bubbles: true, cancelable: true }))`);
  for (let i = 0; i < frames; i++) {
    if (kc && i === Number(kd)) await key("keydown");
    if (kc && i === Number(ku)) await key("keyup");
    await ev("window.__vt.frame(1000/60)"); if (i % 30 === 0) await sleep(30);
  }
  await sleep(300);
  const info = await ev(`JSON.stringify({ title: document.title, canvases: document.querySelectorAll("canvas").length, text: document.body.innerText.slice(0, 120), vt: window.__vt.now })`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  fs.writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify({ info: JSON.parse(info), errors: errors.slice(0, 8) }, null, 1));
  ws.close();
} finally { await cleanup(); }
process.exit(0);
