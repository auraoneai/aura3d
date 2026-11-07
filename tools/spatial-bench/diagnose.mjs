#!/usr/bin/env node
// E6-02 diagnosis driver: runs ONE config in a fresh headless Chrome (ANGLE/Metal) on a loopback CDP port, optionally with
// a V8 sampling CPU profile and/or a Chrome trace (gpu categories) over the measure window, and writes artifacts.
//   node diagnose.mjs --dist dist-prof --viewer aura --cfg pts-100K-10hz-60fps --out results/diagnosis/raw \
//        [--profile] [--trace] [--measure 12000] [--warmup 3000] [--dbg phases,gltime] [--port 9761] [--tag name]
// Holds the shared capture lock (/tmp/a3d-rea.lock) only while the page runs.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, rmdirSync, createReadStream } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { gzipSync } from "node:zlib";
import { configFor } from "./configs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith("--")) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]); return a; }, []));
const dist = resolve(here, args.dist ?? "dist-prof");
const viewer = args.viewer ?? "aura";
const cfg = { ...configFor(args.cfg ?? "pts-100K-10hz-60fps") }; delete cfg.viewers;
cfg.warmupMs = Number(args.warmup ?? 3000);
cfg.measureMs = Number(args.measure ?? 12000);
if (args.rateHz !== undefined) cfg.rateHz = Number(args.rateHz);
if (args.points !== undefined) cfg.points = Number(args.points);
if (args.fps !== undefined) cfg.fps = Number(args.fps);
const out = resolve(here, args.out ?? "results/diagnosis/raw");
const tag = args.tag ?? `${args.cfg ?? "pts-100K-10hz-60fps"}.${viewer}${args.dbg ? "." + String(args.dbg).replace(/,/g, "+") : ""}`;
const port = Number(args.port ?? 9761);
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOCK = "/tmp/a3d-rea.lock";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

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
  send(method, params = {}, t = 120000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error("CDP timeout " + method)); }, t);
      this.pending.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const userDir = mkdtempSync(join(os.tmpdir(), "sb-diag-chrome-"));
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${userDir}`, "--window-size=1280,720", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank"], { stdio: "ignore" });
let held = false;
const cleanup = async () => { if (held) { try { rmdirSync(LOCK); } catch {} held = false; } try { chrome.kill("SIGTERM"); } catch {} await sleep(800); try { chrome.kill("SIGKILL"); } catch {} try { rmSync(userDir, { recursive: true, force: true }); } catch {} server.close(); };
process.on("SIGINT", async () => { await cleanup(); process.exit(130); });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(500); }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  for (;;) { try { mkdirSync(LOCK); held = true; break; } catch { await sleep(2000); } }
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.open();
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Profiler.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const events = [];
  let traceDone;
  const tracePromise = new Promise((r) => { traceDone = r; });
  cdp.handlers.push((m) => { if (m.method === "Tracing.dataCollected") events.push(...m.params.value); if (m.method === "Tracing.tracingComplete") traceDone(); });
  const dbg = (args.dbg ? `&dbg=${args.dbg}` : "") + (args.fix !== undefined ? `&fix=${args.fix}` : "");
  await cdp.send("Page.navigate", { url: `${base}/${viewer}.html?cfg=${encodeURIComponent(JSON.stringify(cfg))}${dbg}` });
  await sleep(cfg.warmupMs + 800);
  const profMs = Math.min(cfg.measureMs - 2500, Number(args.profms ?? 8000));
  if (args.profile) { await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start"); }
  if (args.trace) await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "gpu", "disabled-by-default-gpu.service", "disabled-by-default-gpu.device", "viz", "cc", "v8.gc", "blink"], recordMode: "recordAsMuchAsPossible" }, transferMode: "ReportEvents" });
  await sleep(args.profile || args.trace ? profMs : 0);
  if (args.profile) {
    const { profile } = await cdp.send("Profiler.stop");
    writeFileSync(join(out, `${tag}.cpuprofile.gz`), gzipSync(JSON.stringify(profile)));
  }
  if (args.trace) {
    await cdp.send("Tracing.end"); await tracePromise;
    writeFileSync(join(out, `${tag}.trace.json.gz`), gzipSync(JSON.stringify(events)));
  }
  let result = null;
  const deadline = Date.now() + cfg.measureMs + 120000;
  while (Date.now() < deadline) {
    await sleep(1000);
    try { const r = await cdp.send("Runtime.evaluate", { expression: "window.__SB_DONE__ === true ? JSON.stringify(window.__SB_RESULT__) : null", returnByValue: true }, 15000); if (r.result?.value) { result = JSON.parse(r.result.value); break; } } catch {}
  }
  const rec = { tag, cfg, viewer, dbg: args.dbg ?? null, chrome: version.Browser, loadavg: os.loadavg(), profiled: !!args.profile, traced: !!args.trace, result };
  writeFileSync(join(out, `${tag}.result.json`), JSON.stringify(rec, null, 1));
  const m = result?.measure;
  console.log(tag, result?.failed ? "FAILED " + result.cause?.slice(0, 200) : m ? `fps=${m.effectiveFps.toFixed(1)} frame p50=${m.frameTime.p50.toFixed(1)} cpu=${m.cpuPerFrame.mean.toFixed(1)} tick=${Number(m.cpuTick.mean).toFixed(1)} render=${m.cpuRender.mean.toFixed(1)} load=${os.loadavg()[0].toFixed(0)}` : "NO RESULT");
} finally { await cleanup(); }
