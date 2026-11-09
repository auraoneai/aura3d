#!/usr/bin/env node
// C1 scorer: for every run and both phases (main = after the task, followup = after the follow-up edit):
//   1. stock `vite build` of the phase copy -> build ok, build ms, dist bytes (total, js, js gzip, assets)
//   2. headless Chrome on the real GPU (ANGLE Metal) over a loopback CDP socket -> load ms to the ready flag, two frames
//      3 s apart (visual judge input), runtime fps and p95 frame time over 3 s, page errors
//   3. the task's functional probe (c1/probes.mjs); on the followup phase also the follow-up probe after a reload, and the
//      main probe again to catch regressions.
// Writes <batch>/c1-score.json and <batch>/frames/<runId>-<phase>-{1,2}.png.
//   node tools/agent-eval/c1/score.mjs <batch> [--cdp-port 10681] [--http-port 10682] [--only RUNID,..]
// No Playwright, no Docker, no cloud. Kills only the Chrome it started.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { frameDifference, frameStats } from "../../docs/cheatsheet-lib.mjs";
import { runProbe } from "./probes.mjs";
import { loadTasks } from "./run-c1.mjs";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const CHROME = process.env.AGENT_EVAL_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function distSizes(dist) {
  const out = { totalKB: 0, jsKB: 0, jsGzipKB: 0, assetKB: 0, scaffoldKB: 0, files: 0 };
  const dirKB = (d) => readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? dirKB(join(d, e.name)) : statSync(join(d, e.name)).size / 1024), 0);
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) {
        // Scaffold-shipped look files (public/hdri, public/aura-environments) are counted apart: the app did not author them.
        if (d === dist && (e.name === "hdri" || e.name === "aura-environments")) {
          out.scaffoldKB += dirKB(f);
          continue;
        }
        walk(f);
      } else {
        const size = statSync(f).size;
        out.totalKB += size / 1024;
        out.files += 1;
        if (f.endsWith(".js")) {
          out.jsKB += size / 1024;
          out.jsGzipKB += gzipSync(readFileSync(f)).length / 1024;
        } else if (!/\.(html|css|map)$/.test(f)) out.assetKB += size / 1024;
      }
    }
  };
  if (existsSync(dist)) walk(dist);
  for (const k of ["totalKB", "jsKB", "jsGzipKB", "assetKB", "scaffoldKB"]) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

export function buildPhase(dir, outDir) {
  const started = Date.now();
  const r = spawnSync("nice", ["-n", "10", join(dir, "node_modules/.bin/vite"), "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"], { cwd: dir, encoding: "utf8", timeout: 300000 });
  return { ok: r.status === 0, ms: Date.now() - started, log: r.status === 0 ? "" : `${r.stdout}${r.stderr}`.slice(-1500) };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method) this.events.push(msg);
    });
    // A dead browser must fail pending calls, not hang the scorer.
    ws.addEventListener("close", () => {
      for (const done of this.pending.values()) done({ error: { message: "CDP socket closed" } });
      this.pending.clear();
    });
  }
  send(method, params = {}, timeoutMs = 45000) {
    const id = ++this.id;
    if (this.ws.readyState !== 1) return Promise.reject(new Error(`${method}: CDP socket closed`));
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`${method}: CDP timeout after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) fail(new Error(`${method}: ${msg.error.message}`));
        else ok(msg.result);
      });
    });
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".hdr": "application/octet-stream", ".png": "image/png", ".ktx2": "image/ktx2" };
function serve(root, port) {
  return new Promise((ok, fail) => {
    const server = createServer((req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
      if (p.endsWith("/")) p += "index.html";
      const file = join(root, p);
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404).end("nf");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(file));
    });
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ok(server));
  });
}

let sharpMod;
async function decode(b64) {
  sharpMod ??= (await import(join(REPO, "node_modules/sharp/lib/index.js"))).default;
  const { data, info } = await sharpMod(Buffer.from(b64, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data, png: Buffer.from(b64, "base64") };
}

const READY_EXPR = "Boolean(window.__EVAL_READY__ === true || window.__TASK_READY__ === true || (window.__TASK_STATE__ && window.__TASK_STATE__.ready === true))";
const FPS_EXPR = `new Promise((done) => { const t = []; const start = performance.now(); function f(now) { t.push(now); if (now - start < 3000) requestAnimationFrame(f); else { const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b); done({ fps: Math.round(((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)) * 10) / 10, p95FrameMs: Math.round((d[Math.floor(d.length * 0.95)] ?? 0) * 10) / 10 }); } } requestAnimationFrame(f); })`;

/** A CDP-backed page driver with the interface c1/probes.mjs expects. */
function pageDriver(cdp) {
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`.slice(0, 300));
    return r.result.value;
  };
  const mouse = async (x, y) => {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1 });
  };
  const KEYS = { Space: [" ", 32], KeyR: ["r", 82], KeyP: ["p", 80], Digit1: ["1", 49], Digit2: ["2", 50], Digit3: ["3", 51], Enter: ["Enter", 13], Escape: ["Escape", 27] };
  return {
    eval: (e) => evaluate(e),
    state: async () => JSON.parse((await evaluate("JSON.stringify(window.__TASK_STATE__ ?? null)")) ?? "null"),
    sleep,
    async key(code) {
      const [key, vk] = KEYS[code] ?? [code, 0];
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code, key, windowsVirtualKeyCode: vk, ...(key.length === 1 ? { text: key } : {}) });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code, key, windowsVirtualKeyCode: vk });
    },
    async clickCanvas(fx, fy) {
      const r = await evaluate("(() => { const c = document.getElementById('app'); if (!c) return null; const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()");
      if (!r) return false;
      await mouse(r[0] + r[2] * fx, r[1] + r[3] * fy);
      return true;
    },
    async clickText(re) {
      // The canvas fills the 640x360 viewport, so DOM UI placed after it is below the fold: scroll the element into view
      // for a real mouse click, then scroll back so later frames show the same view.
      const r = await evaluate(`(() => { const re = new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}); const els = [...document.querySelectorAll('button, [role=button], input[type=button], a, div, span')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && re.test((e.innerText ?? e.value ?? '').trim()) && ![...e.children].some((c) => re.test((c.innerText ?? '').trim())); }); const e = els.find((x) => x.tagName === 'BUTTON') ?? els[0]; if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
      if (!r) return false;
      await mouse(r[0], r[1]);
      await evaluate("window.scrollTo(0, 0)");
      return true;
    },
    text: () => evaluate("document.body ? document.body.innerText : ''"),
    async frame() {
      return decode((await cdp.send("Page.captureScreenshot", { format: "png" })).data);
    },
    diff: (a, b) => frameDifference(a, b)
  };
}

async function openPage(cdpPort) {
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener("open", ok);
    ws.addEventListener("error", fail);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  return {
    cdp,
    close: async () => {
      ws.close();
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => undefined);
    }
  };
}

async function load(cdp, url, timeoutMs = 20000) {
  cdp.events.length = 0;
  const started = Date.now();
  await cdp.send("Page.navigate", { url });
  let ready = false;
  while (Date.now() - started < timeoutMs && !ready) {
    await sleep(50);
    ready = (await cdp.send("Runtime.evaluate", { returnByValue: true, expression: READY_EXPR })).result.value === true;
  }
  return { ready, loadMs: ready ? Date.now() - started : null };
}

const ignorable = (e) => e.method === "Log.entryAdded" && /favicon\.ico$/.test(e.params.entry.url ?? "");
const pageErrors = (cdp) =>
  cdp.events
    .filter((e) => !ignorable(e) && (e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error")))
    .map((e) => (e.method === "Runtime.exceptionThrown" ? `exception: ${e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text}` : `${e.params.entry.text} ${e.params.entry.url ?? ""}`).slice(0, 300));

/** Measure one built phase. `probes`: names to run, each after a fresh load (probes change page state). */
export async function measurePhase({ cdpPort, url, framesPrefix, probes }) {
  const { cdp, close } = await openPage(cdpPort);
  try {
    const page = pageDriver(cdp);
    const { ready, loadMs } = await load(cdp, url);
    await sleep(2500);
    const f1 = await page.frame();
    await sleep(3000);
    const f2 = await page.frame();
    writeFileSync(`${framesPrefix}-1.png`, f1.png);
    writeFileSync(`${framesPrefix}-2.png`, f2.png);
    const stats = frameStats(f1);
    const runtime = await cdp.send("Runtime.evaluate", { expression: FPS_EXPR, returnByValue: true, awaitPromise: true }).then((r) => r.result.value).catch(() => null);
    // Bytes the page actually fetched by now (emitted lazy chunks that never load are in `size`, not here).
    const loaded = await cdp.send("Runtime.evaluate", { returnByValue: true, expression: "(() => { const r = performance.getEntriesByType('resource'); const kb = (f) => Math.round(r.filter(f).reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 102.4) / 10; return { totalKB: kb(() => true), jsKB: kb((e) => /\\.m?js(\\?|$)/.test(e.name)), requests: r.length }; })()" }).then((r) => r.result.value).catch(() => null);
    const errors = pageErrors(cdp);
    const probeResults = {};
    for (const name of probes) {
      await load(cdp, url);
      await sleep(800);
      probeResults[name] = await runProbe(name, page);
    }
    return {
      ready,
      loadMs,
      blank: !(stats.litFraction > 0.2 && stats.stdLuma > 3),
      frame: { lit: Math.round(stats.litFraction * 1000) / 1000, meanLuma: Math.round(stats.meanLuma * 10) / 10, stdLuma: Math.round(stats.stdLuma * 10) / 10, motion: Math.round(frameDifference(f1, f2) * 100) / 100 },
      loaded,
      fps: runtime?.fps ?? null,
      p95FrameMs: runtime?.p95FrameMs ?? null,
      pageErrors: errors,
      probes: probeResults
    };
  } finally {
    await close();
  }
}

export async function startChrome(cdpPort) {
  const profile = mkdtempSync(join(tmpdir(), "a3d-c1-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cdpPort}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-webgl", "--no-first-run", "--disable-extensions", "--window-size=640,360", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 100; i += 1) {
    try {
      await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
      return { chrome, profile, stop: () => { chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true }); } };
    } catch {
      await sleep(100);
    }
  }
  chrome.kill("SIGKILL");
  throw new Error("headless Chrome did not start");
}

async function main(argv) {
  const [batch, ...rest] = argv;
  if (!batch) throw new Error("usage: score.mjs <batch> [--cdp-port N] [--http-port N] [--only RUNID,..]");
  const opt = (name, dflt) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : dflt);
  const cdpPort = Number(opt("--cdp-port", 10681));
  const httpPort = Number(opt("--http-port", 10682));
  const only = opt("--only", null)?.split(",");
  const work = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
  const batchDir = resolve(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval-c1", batch);
  const tasks = Object.fromEntries(loadTasks().tasks.map((t) => [t.id, t]));
  const framesDir = join(batchDir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const outFile = join(batchDir, "c1-score.json");
  const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  const ids = readdirSync(join(batchDir, "runs")).filter((id) => existsSync(join(batchDir, "runs", id, "run.json")) && (!only || only.includes(id))).sort();
  let browser = await startChrome(cdpPort);
  // A crashed or wedged Chrome (GPU process loss) gets one restart per phase; a second failure is recorded, not fatal.
  const measureWithRestart = async (args) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await measurePhase(args);
      } catch (error) {
        browser.stop();
        browser = await startChrome(cdpPort);
        if (attempt >= 2) return { measureError: String(error?.message ?? error).slice(0, 300) };
      }
    }
  };
  try {
    let browserStarted = Date.now();
    for (const id of ids) {
      // The machine's process reaper kills headless Chrome older than 30 minutes; recycle ours well before that.
      if (Date.now() - browserStarted > 20 * 60 * 1000) {
        browser.stop();
        browser = await startChrome(cdpPort);
        browserStarted = Date.now();
      }
      const run = JSON.parse(readFileSync(join(batchDir, "runs", id, "run.json"), "utf8"));
      const task = tasks[run.task];
      const entry = { runId: id, arm: run.arm, task: run.task, phases: {} };
      for (const phase of ["main", "followup"]) {
        const dir = join(work, batch, id, `phase-${phase}`);
        if (!existsSync(dir)) {
          entry.phases[phase] = { missing: true };
          continue;
        }
        const dist = join(work, batch, id, `dist-${phase}`);
        const build = buildPhase(dir, dist);
        const result = { build: { ok: build.ok, ms: build.ms, log: build.log }, size: build.ok ? distSizes(dist) : null };
        if (build.ok) {
          const server = await serve(dist, httpPort);
          try {
            Object.assign(result, await measureWithRestart({ cdpPort, url: `http://127.0.0.1:${httpPort}/index.html`, framesPrefix: join(framesDir, `${id}-${phase}`), probes: phase === "main" ? [task.probe] : [task.followUp.probe, task.probe] }));
          } finally {
            await new Promise((r) => server.close(r));
          }
        }
        entry.phases[phase] = result;
        const pr = Object.values(result.probes ?? {}).map((p) => `${p.name} ${p.passed}/${p.total}`).join(", ");
        console.log(`[c1-score] ${id} ${phase} build=${build.ok} ready=${result.ready} load=${result.loadMs}ms fps=${result.fps} errors=${result.pageErrors?.length ?? "-"} ${pr}`);
      }
      results[id] = entry;
      writeFileSync(outFile, JSON.stringify(results, null, 2));
    }
  } finally {
    browser.stop();
  }
  console.log("wrote", outFile);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
