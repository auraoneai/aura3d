#!/usr/bin/env node
// Driver: serves dist/, launches ONE headless Chrome with real GPU (ANGLE/Metal) on a loopback CDP port, runs every
// config x viewer x repetition in a fresh tab, and appends one JSON line per run to <out>/runs.jsonl.
//
//   node run.mjs [--out results/<date>] [--reps 3] [--only <id-substring>] [--viewers aura,three] [--port 9755]
//                [--chrome <path>] [--list] [--dry-run]
//
// Every run takes the shared capture lock (mkdir /tmp/a3d-rea.lock) and releases it afterwards, so other lanes can interleave.
// Runs are ordered rep-major and interleaved (rep > config > viewer) so machine noise spreads across both viewers.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, appendFileSync, writeFileSync, rmdirSync } from "node:fs";
import { createReadStream } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { buildConfigs, WARMUP_MS, MEASURE_MS } from "./configs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const date = new Date().toISOString().slice(0, 10);
const outDir = resolve(here, args.out ?? `results/${date}`);
const reps = Number(args.reps ?? 3);
const port = Number(args.port ?? 9755);
const viewersFilter = String(args.viewers ?? "aura,three").split(",");
const chromePath = args.chrome ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOCK = "/tmp/a3d-rea.lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN_TIMEOUT_MS = (args.quick ? 5000 : WARMUP_MS + MEASURE_MS) + 90000;
const WINDOW = { width: 1280, height: 720 };

let configs = buildConfigs();
if (args.only) configs = configs.filter((c) => c.id.includes(String(args.only)));
const plan = [];
for (let rep = 1; rep <= reps; rep++) for (const c of configs) for (const viewer of ["aura", "three"]) {
  if (!viewersFilter.includes(viewer)) continue;
  if (c.viewers && !c.viewers.includes(viewer)) continue;
  plan.push({ id: `${c.id}|${viewer}|${rep}`, cfg: c, viewer, rep });
}
if (args.list) { for (const p of plan) console.log(p.id); console.log(plan.length, "runs"); process.exit(0); }
mkdirSync(outDir, { recursive: true });
const runsFile = join(outDir, "runs.jsonl");
const done = new Set(existsSync(runsFile) ? readFileSync(runsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).runId) : []);

// --- static server for dist/
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = join(here, "dist", url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!file.startsWith(join(here, "dist")) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// --- lock
let held = false;
async function acquire() {
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK); held = true; return Date.now() - t0; } catch { await sleep(2000); }
  }
}
function release() { if (held) { try { rmdirSync(LOCK); } catch { /* already gone */ } held = false; } }

// --- chrome
let chrome = null;
let userDir = null;
async function startChrome() {
  userDir = mkdtempSync(join(os.tmpdir(), "spatial-bench-chrome-"));
  chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${userDir}`,
    `--window-size=${WINDOW.width},${WINDOW.height}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist",
    "--enable-precise-memory-info", "--js-flags=--expose-gc", "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion", "about:blank"
  ], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("chrome did not start");
}
async function stopChrome() {
  if (chrome) { chrome.kill("SIGTERM"); await sleep(1500); try { chrome.kill("SIGKILL"); } catch { /* gone */ } chrome = null; }
  if (userDir) { try { rmSync(userDir, { recursive: true, force: true }); } catch { /* best effort */ } userDir = null; }
}

// --- minimal CDP client over the global WebSocket
class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = []; }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error("ws error")); });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
      else if (msg.method) for (const h of this.handlers) h(msg);
    };
  }
  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

function hostInfo(version) {
  const sh = (cmd, a) => { try { return execFileSync(cmd, a).toString().trim(); } catch { return null; } };
  return {
    chromeBrowser: version.Browser, chromeProtocol: version["Protocol-Version"], userAgent: version["User-Agent"],
    macModel: sh("sysctl", ["-n", "hw.model"]), cpu: sh("sysctl", ["-n", "machdep.cpu.brand_string"]),
    cpuCores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30),
    macOS: sh("sw_vers", ["-productVersion"]), macBuild: sh("sw_vers", ["-buildVersion"]), kernel: os.release(), node: process.version,
    chromeFlags: "--headless=new --enable-gpu --use-angle=metal --ignore-gpu-blocklist --enable-precise-memory-info --js-flags=--expose-gc",
    window: WINDOW, deviceScaleFactor: 1, warmupMs: WARMUP_MS, measureMs: MEASURE_MS
  };
}

async function runOne(item, version) {
  const wait = await acquire();
  const load0 = os.loadavg();
  const record = { runId: item.id, configId: item.cfg.id, viewer: item.viewer, rep: item.rep, lockWaitMs: wait, loadavgStart: load0, startedAt: new Date().toISOString() };
  let cdp = null;
  let targetId = null;
  try {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    targetId = t.id;
    cdp = new Cdp(t.webSocketDebuggerUrl);
    await cdp.open();
    const consoleLines = [];
    cdp.handlers.push((m) => {
      if (m.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(m.params.type)) consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
      if (m.method === "Runtime.exceptionThrown") consoleLines.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    });
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...WINDOW, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const cfg = { ...item.cfg }; delete cfg.viewers;
    if (args.quick) { cfg.warmupMs = 1000; cfg.measureMs = 4000; }
    await cdp.send("Page.navigate", { url: `${base}/${item.viewer}.html?cfg=${encodeURIComponent(JSON.stringify(cfg))}${args.dbg ? `&dbg=${args.dbg}` : ""}` });
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let result = null;
    while (Date.now() < deadline) {
      await sleep(1000);
      let r;
      try { r = await cdp.send("Runtime.evaluate", { expression: "window.__SB_DONE__ === true ? JSON.stringify(window.__SB_RESULT__) : null", returnByValue: true }, 15000); } catch { continue; }
      if (r.result?.value) { result = JSON.parse(r.result.value); break; }
    }
    if (!result) {
      record.failed = true; let stage = "unknown (main thread blocked)";
      try { stage = (await cdp.send("Runtime.evaluate", { expression: "window.__SB_STAGE__", returnByValue: true }, 5000)).result?.value ?? stage; } catch { /* blocked */ }
      record.cause = "TIMEOUT in stage '" + stage + "': page did not finish within " + RUN_TIMEOUT_MS + " ms (main thread blocked or viewer too slow to complete the window)";
      record.restartChrome = true;
    } else {
      Object.assign(record, result);
      if (item.cfg.shot && item.rep === 1 && !result.failed) {
        try {
          const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 60, clip: { x: 0, y: 0, ...WINDOW, scale: 0.5 } });
          mkdirSync(join(outDir, "frames"), { recursive: true });
          writeFileSync(join(outDir, "frames", `${item.cfg.id}.${item.viewer}.jpg`), Buffer.from(shot.data, "base64"));
        } catch (e) { record.screenshotError = String(e); }
      }
    }
    record.consoleErrors = consoleLines.slice(0, 20);
  } catch (e) {
    record.failed = true; record.cause = "DRIVER: " + String(e?.stack ?? e).slice(0, 800); record.restartChrome = true;
  } finally {
    record.loadavgEnd = os.loadavg();
    record.finishedAt = new Date().toISOString();
    try { cdp?.close(); } catch { /* ignore */ }
    if (targetId) { try { await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch { /* ignore */ } }
    release();
  }
  record.chromeVersion = version.Browser;
  return record;
}

process.on("SIGINT", async () => { release(); await stopChrome(); process.exit(130); });
process.on("SIGTERM", async () => { release(); await stopChrome(); process.exit(143); });

const todo = plan.filter((p) => !done.has(p.id));
console.log(`${plan.length} planned, ${done.size} already done, ${todo.length} to run; out=${outDir}`);
if (args["dry-run"]) process.exit(0);
let version = await startChrome();
const host = hostInfo(version);
writeFileSync(join(outDir, "host.json"), JSON.stringify({ ...host, startedAt: new Date().toISOString(), loadavgAtStart: os.loadavg() }, null, 2));
let n = 0;
try {
  for (const item of todo) {
    n++;
    const rec = await runOne(item, version);
    appendFileSync(runsFile, JSON.stringify(rec) + "\n");
    const m = rec.measure;
    console.log(`[${n}/${todo.length}] ${item.id} ${rec.failed ? "FAILED " + String(rec.cause).split("\n")[0].slice(0, 120) : `p50=${m.frameTime.p50.toFixed(1)}ms p95=${m.frameTime.p95.toFixed(1)}ms cpu=${m.cpuPerFrame.mean.toFixed(2)}ms fps=${m.effectiveFps.toFixed(1)}`}`);
    if (rec.restartChrome) { await stopChrome(); version = await startChrome(); }
  }
} finally {
  release();
  await stopChrome();
  server.close();
}
