#!/usr/bin/env node
// Real-GPU two-frame capture over loopback CDP to a headless Chrome (Metal on macOS). No Playwright, no Docker.
// Serves a static dist directory on 127.0.0.1, opens a page, waits for settle, screenshots frame A, waits the interval,
// screenshots frame B, and reports the 64x36 mean-abs-luma difference (same method as motion.mjs). It also records
// idle cost: requestAnimationFrame rate, WebGL draw calls per second, page CPU ms/s (CDP Performance metrics) and the
// GPU-process CPU ms/s (ps) over a measurement window.
//
//   node tools/release/render-gate/cdp-capture.mjs --dir /tmp/probe-fix --page utime-static/index.html --out evidence/utime-512/fix \
//     [--overlay <dir>] [--query "?x=1"] [--settle 4000] [--interval 3000] [--measure 4000] [--size 960x540] [--port 0]
//
// Hold /tmp/a3d-rea.lock around the call when other agents share the Mac. Output: <out>-a.png, <out>-b.png, <out>.json.
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { decodePng } from "./png.mjs";
import { analyzeMotion } from "./motion.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const dir = args.dir, page = args.page, out = args.out;
if (!dir || !page || !out) { console.error("usage: --dir <dist> --page <path> --out <prefix>"); process.exit(2); }
const settle = Number(args.settle ?? 4000), interval = Number(args.interval ?? 3000), measure = Number(args.measure ?? 4000);
const [W, H] = (args.size ?? "960x540").split("x").map(Number);
const chrome = args.chrome ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  // --overlay <dir>: fallback root for files missing from the build (e.g. the monorepo `public/` asset tree the deploy copies in).
  if (!existsSync(file) && args.overlay) { const alt = normalize(join(args.overlay, decodeURIComponent(url.pathname))); if (alt.startsWith(normalize(args.overlay)) && existsSync(alt) && statSync(alt).isFile()) file = alt; }
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(Number(args.port ?? 0), "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "a3d-cdp-"));
const proc = spawn(chrome, [`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--headless=new", "--no-first-run", "--no-default-browser-check", ...(args.gpuFlags === "angle" ? ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] : []), "--autoplay-policy=no-user-gesture-required", `--window-size=${W},${H}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  const t = setTimeout(() => reject(new Error("chrome did not start")), 30000);
  proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
});
const cleanup = () => { try { proc.kill("SIGKILL"); } catch {} try { server.close(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup); process.on("SIGINT", () => process.exit(130)); process.on("SIGTERM", () => process.exit(143));

const browser = new WebSocket(wsUrl);
await new Promise((r) => browser.addEventListener("open", r));
const sessionIdRef = { value: null };
let id = 0; const pending = new Map(); const events = [];
browser.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
  else if (msg.method) { events.push(msg); if (msg.method === "Target.attachedToTarget" && msg.params.sessionId !== sessionIdRef.value) { for (const m of ["Runtime.enable", "Log.enable"]) send(m, {}, msg.params.sessionId).catch(() => {}); send("Runtime.runIfWaitingForDebugger", {}, msg.params.sessionId).catch(() => {}); } }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); browser.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const cmd0 = (m, p) => send(m, p, sessionId);
sessionIdRef.value = sessionId;
await cmd0("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
const cmd = (m, p) => send(m, p, sessionId);
await cmd("Page.enable"); await cmd("Runtime.enable"); await cmd("Performance.enable"); await cmd("Log.enable"); await cmd("Network.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// Count draw calls and rAF callbacks from the first script.
if (args.instrument !== "off") await cmd("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__a3dDraws = 0; window.__a3dRaf = 0;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue;
    for (const f of ["drawElements","drawArrays","drawElementsInstanced","drawArraysInstanced","drawRangeElements"]) { const o = C.prototype[f]; if (o) C.prototype[f] = function(...a){ window.__a3dDraws++; return o.apply(this, a); }; } }
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { window.__a3dRaf++; cb(t); });
` });
const navResult = await cmd("Page.navigate", { url: `${origin}/${page}${args.query ?? ""}` });
if (args.debug) console.log("navigate", JSON.stringify(navResult));
await sleep(settle);
const evalJs = async (expression) => (await cmd("Runtime.evaluate", { expression, returnByValue: true })).result.value;
const shot = async (file) => { const { data } = await cmd("Page.captureScreenshot", { format: "png" }); mkdirSync(dirname(file), { recursive: true }); const buf = Buffer.from(data, "base64"); writeFileSync(file, buf); return buf; };

const gpuInfo = await evalJs(`(() => { const c = document.createElement("canvas"); const gl = c.getContext("webgl2"); if (!gl) return null; const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "n/a"; })()`);
const ready = await evalJs(`document.documentElement.dataset.aura3dReady ?? document.body?.dataset?.aura3dReady ?? document.querySelector("[data-aura3d-ready]")?.dataset.aura3dReady ?? null`);
if (args.debug) console.log("doc", await evalJs("location.href + \" \" + document.readyState + \" \" + document.documentElement.outerHTML.length + \" vis=\" + document.visibilityState + \" raf=\" + window.__a3dRaf + \" draws=\" + window.__a3dDraws + \" canvas=\" + document.getElementById(\"app\")?.width + \" attrs=\" + JSON.stringify(document.getElementById(\"app\")?.dataset)"), events.map((e) => e.method).slice(0, 40).join(","));
if (args.debug) console.log("marks", await evalJs("performance.getEntriesByType(\"mark\").map((m) => m.name + \"@\" + Math.round(m.startTime)).join(\" \")"));
if (args.debug) console.log("gpu", await cmd("Runtime.evaluate", { expression: "Promise.race([(navigator.gpu ? navigator.gpu.requestAdapter().then((a) => a ? a.requestDevice().then((d) => \"device:\" + d.limits.maxTextureDimension2D, (e) => \"devfail:\" + e) : \"null-adapter\") : Promise.resolve(\"no-navigator.gpu\")), new Promise((r) => setTimeout(() => r(\"timeout\"), 5000))])", awaitPromise: true, returnByValue: true }).then((r) => JSON.stringify(r.result.value)));
if (args.debug) console.log("rafprobe", await cmd("Runtime.evaluate", { expression: "new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); setTimeout(() => r(\"stalled:\" + n), 3000); })", awaitPromise: true, returnByValue: true }).then((r) => JSON.stringify(r.result.value)));
if (args.debug) { const req = events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url); const fin = new Set(events.filter((e) => e.method === "Network.loadingFinished").map((e) => e.params.requestId)); console.log("requests", events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => `${fin.has(e.params.requestId) ? "ok" : "PENDING"} ${e.params.request.url}`).join("\n  ")); }
const bufA = await shot(`${out}-a.png`);
await sleep(interval);
const bufB = await shot(`${out}-b.png`);

// Idle-cost window.
const metrics = async () => Object.fromEntries((await cmd("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const gpuCpuSeconds = () => {
  try {
    const ps = execFileSync("ps", ["-axo", "pid=,time=,command="], { encoding: "utf8" }).split("\n").filter((l) => l.includes(profile) && l.includes("--type=gpu-process"));
    return ps.map((l) => { const t = l.trim().split(/\s+/)[1]; const [mm, ss] = t.split(":"); return Number(mm) * 60 + Number(ss); }).reduce((a, b) => a + b, 0);
  } catch { return 0; }
};
const m0 = await metrics(), d0 = await evalJs("window.__a3dDraws"), r0 = await evalJs("window.__a3dRaf"), g0 = gpuCpuSeconds(), t0 = Date.now();
await sleep(measure);
const m1 = await metrics(), d1 = await evalJs("window.__a3dDraws"), r1 = await evalJs("window.__a3dRaf"), g1 = gpuCpuSeconds(), secs = (Date.now() - t0) / 1000;
const consoleLines = events.filter((e) => e.method === "Runtime.consoleAPICalled").map((e) => `${e.sessionId === sessionId ? "" : "[worker] "}${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
const netFailures = events.filter((e) => e.method === "Network.loadingFailed" || (e.method === "Network.responseReceived" && e.params.response.status >= 400)).map((e) => e.params.errorText ?? `${e.params.response.status} ${e.params.response.url}`);
const logEntries = events.filter((e) => e.method === "Log.entryAdded").map((e) => `${e.sessionId === sessionId ? "" : "[worker] "}${e.params.entry.level}: ${e.params.entry.text}`);
const exceptions = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);

const analysis = analyzeMotion(decodePng(bufA), decodePng(bufB));
const result = {
  page: `${page}${args.query ?? ""}`, size: [W, H], settleMs: settle, intervalMs: interval, gpuRenderer: gpuInfo, aura3dReady: ready,
  diff: analysis.diff, moving: analysis.moving, console: consoleLines.slice(-30), log: logEntries.slice(-20), netFailures, exceptions,
  idle: {
    windowSeconds: Number(secs.toFixed(2)),
    rafPerSecond: Number(((r1 - r0) / secs).toFixed(2)), drawCallsPerSecond: Number(((d1 - d0) / secs).toFixed(1)),
    pageCpuMsPerSecond: Number((((m1.TaskDuration - m0.TaskDuration) * 1000) / secs).toFixed(2)),
    pageScriptMsPerSecond: Number((((m1.ScriptDuration - m0.ScriptDuration) * 1000) / secs).toFixed(2)),
    gpuProcessCpuMsPerSecond: Number((((g1 - g0) * 1000) / secs).toFixed(1)),
    note: "rAF/draw counters are wrapped from page start; page CPU = CDP Performance TaskDuration; GPU = CPU time of the GPU process via ps (1 s resolution), not GPU shader time."
  }
};
writeFileSync(`${out}.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ out, diff: result.diff, ready, gpu: gpuInfo, exceptions: exceptions.length, idle: result.idle }, null, 1));
cleanup();
process.exit(0);
