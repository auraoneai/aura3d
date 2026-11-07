#!/usr/bin/env node
// Local scorer for a finished agent-eval batch without Playwright and without ACR: stock `vite build` of each final sandbox,
// then two frames 3 s apart from headless Chrome on the real GPU over a loopback CDP socket. Writes <batch>/remote/results.json
// in the shape score.mjs reads. Only pixel probes (blank, animated) plus page errors are measured; task-specific page probes are not.
//   node tools/agent-eval/score-cdp.mjs <batch>        (env AGENT_EVAL_WORK, AGENT_EVAL_EVIDENCE as for run.mjs)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { frameDifference, frameStats } from "../docs/cheatsheet-lib.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const batch = process.argv[2];
if (!batch) throw new Error("usage: score-cdp.mjs <batch>");
const batchDir = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const runsDir = join(WORK, batch);
const ids = readdirSync(join(batchDir, "runs")).sort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(name, fn) {
  const lock = `/tmp/${name}.lock`;
  for (;;) {
    try { mkdirSync(lock); break; } catch { await sleep(20 + Math.random() * 60); }
  }
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}
const jsKb = (dist) => {
  const dir = join(dist, "assets");
  return existsSync(dir) ? Math.round((readdirSync(dir).filter((f) => f.endsWith(".js")).reduce((a, f) => a + statSync(join(dir, f)).size, 0) / 1024) * 10) / 10 : null;
};

const results = existsSync(join(batchDir, "remote/results.json")) ? JSON.parse(readFileSync(join(batchDir, "remote/results.json"), "utf8")) : [];
const done = new Set(results.map((r) => r.id));
const builds = {};

// 1. builds (serialised with the machine-wide lock, niced)
for (const id of ids) {
  if (done.has(`${id}-final`)) continue;
  const sandbox = join(runsDir, id, "sandbox");
  if (!existsSync(sandbox)) continue;
  builds[id] = await withLock("a3d-build", async () => {
    const started = Date.now();
    const r = spawnSync("nice", ["-n", "10", join(sandbox, "node_modules/.bin/vite"), "build", "--outDir", join(runsDir, id, "dist"), "--emptyOutDir", "--logLevel", "error"], { cwd: sandbox, encoding: "utf8", timeout: 300000 });
    console.log(id, r.status === 0 ? "built" : `BUILD FAIL ${(r.stdout + r.stderr).slice(-200)}`);
    return { ok: r.status === 0, ms: Date.now() - started };
  });
}

// 2. frames (serialised with the REA lock)
class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => this.pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result))));
  }
}
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
const serve = (root) => new Promise((ok) => {
  const server = createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    const file = join(root, p);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end("nf"); return; }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  server.listen(0, "127.0.0.1", () => ok(server));
});
const decode = async (b64) => {
  const sharp = (await import(join(REPO, "node_modules/sharp/lib/index.js"))).default;
  const { data, info } = await sharp(Buffer.from(b64, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data, sharp };
};

const todo = Object.keys(builds).filter((id) => builds[id].ok);
await withLock("a3d-rea", async () => {
  const profile = mkdtempSync(join(tmpdir(), "a3d-evalscore-"));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--ignore-gpu-blocklist", "--enable-webgl", "--window-size=640,360", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let browserWs = "";
  chrome.stderr.on("data", (d) => { const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/); if (m) browserWs = m[1]; });
  for (let i = 0; i < 100 && !browserWs; i += 1) await sleep(100);
  if (!browserWs) throw new Error("headless Chrome did not start");
  const cdpPort = new URL(browserWs).port;
  try {
    for (const id of todo) {
      const dist = join(runsDir, id, "dist");
      const server = await serve(dist);
      const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, fail) => { ws.addEventListener("open", ok); ws.addEventListener("error", fail); });
      const cdp = new Cdp(ws);
      await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
      const started = Date.now();
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
      let ready = false;
      while (Date.now() - started < 20000 && !ready) {
        await sleep(300);
        ready = (await cdp.send("Runtime.evaluate", { returnByValue: true, expression: "window.__EVAL_READY__ === true" })).result.value === true;
      }
      const readyMs = ready ? Date.now() - started : null;
      await sleep(2500);
      const a = await decode((await cdp.send("Page.captureScreenshot", { format: "png" })).data);
      await sleep(3000);
      const b = await decode((await cdp.send("Page.captureScreenshot", { format: "png" })).data);
      const s = frameStats(a);
      const diff = frameDifference(a, b);
      const errors = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error")).map((e) => JSON.stringify(e.params).slice(0, 300));
      mkdirSync(join(batchDir, "frames"), { recursive: true });
      for (const [tag, f] of [["t0", a], ["t3", b]]) await a.sharp(f.data, { raw: { width: f.width, height: f.height, channels: 4 } }).png().toFile(join(batchDir, "frames", `${id}-${tag}.png`));
      results.push({
        id: `${id}-final`,
        build: { ok: true },
        readyTimeout: !ready,
        page: { pageErrors: errors, consoleErrorCount: errors.length },
        probes: { blank: !(s.litFraction > 0.2 && s.stdLuma > 3), animated: diff > 0.1, frame: { nonblack: s.litFraction, std: s.stdLuma, diff } },
        bundle: { rawKB: jsKb(dist) },
        readyMs
      });
      console.log(id, `lit=${s.litFraction.toFixed(2)} std=${s.stdLuma.toFixed(1)} diff=${diff.toFixed(2)} ready=${ready} errors=${errors.length}`);
      ws.close(); server.close();
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => undefined);
    }
  } finally {
    chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true });
  }
});
for (const id of ids) if (builds[id] && !builds[id].ok) results.push({ id: `${id}-final`, build: { ok: false }, readyTimeout: true, page: { pageErrors: [], consoleErrorCount: 0 }, bundle: { rawKB: null }, readyMs: null });
mkdirSync(join(batchDir, "remote"), { recursive: true });
writeFileSync(join(batchDir, "remote/results.json"), JSON.stringify(results, null, 2));
console.log("wrote", results.length, "results");
