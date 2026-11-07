// Lane 519 clean-consumer capture (ccap.mjs from physics-514 plus positions(), the app timeline and a timed network log). usage: node ccap519.mjs <distDir> <out.png> [query] [waitMs=6000]
// Loopback CDP to headless Chrome (real GPU, ANGLE Metal). Records every fetched script/wasm URL, full console.error text and
// full uncaught exception text, the recipe's diagnostics().errors when exposed, and a screenshot. Holds /tmp/a3d-rea.lock while capturing.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const [dist, out, query, waitArg] = process.argv.slice(2);
const wait = Number(waitArg || 6000);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png" };
const server = await new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const f = path.join(dist, rel);
    if (!f.startsWith(dist) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  }).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => s.close(r)) }));
});
const port = 9400 + Math.floor(Math.random() * 250);
const prof = `/tmp/phys519-chrome-${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lock = "/tmp/a3d-rea.lock";
let ownLock = false;
while (true) { try { fs.mkdirSync(lock); ownLock = true; break; } catch { await sleep(250); } }
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--window-size=960,540", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
const cleanup = async () => { try { chrome.kill(); } catch {} if (ownLock) { ownLock = false; try { fs.rmdirSync(lock); } catch {} } await server.close().catch(() => {}); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch {} };
setTimeout(async () => { console.error("watchdog: capture exceeded 120 s"); await cleanup(); process.exit(2); }, 120000).unref();
try {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(250); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let t0; const timed = []; let n = 0; const pend = new Map(); const consoleErrors = []; const exceptions = []; const requests = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
    else if (d.method === "Network.requestWillBeSent") { const url = d.params.request.url.replace(server.url, ""); requests.push(url); if (t0 === undefined) t0 = d.params.timestamp; timed.push({ ms: Math.round((d.params.timestamp - t0) * 1000), url }); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${server.url}/index.html${query ? "?" + query : ""}` });
  await sleep(wait);
  const diag = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__PHYSICS_RECIPE__ ? { errors: window.__PHYSICS_RECIPE__.diagnostics(), stats: window.__PHYSICS_RECIPE__.stats, positions: window.__PHYSICS_RECIPE__.positions(), timeline: window.__PHYSICS_RECIPE__.timeline ?? null, navigationStart: performance.timeOrigin } : null)", returnByValue: true });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  const report = { dist, query: query || "", fetchedScripts: requests.filter((u) => /\.(js|wasm)(\?|$)/.test(u)), networkTimeline: timed.filter((r) => /\.(js|wasm|html)(\?|$)/.test(r.url)), consoleErrors, exceptions, recipe: JSON.parse(diag.result?.result?.value ?? "null") };
  fs.writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify(report).slice(0, 600));
  ws.close();
} finally { await cleanup(); }
process.exit(0);
