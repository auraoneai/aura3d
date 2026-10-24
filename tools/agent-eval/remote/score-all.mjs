#!/usr/bin/env node
// Runs INSIDE the remote container (ACR task, software WebGL2): stock `vite build` of every staged snapshot, headless
// Chromium load, frame checks and per-task probes. Results leave through the run log as AGENTEVAL_RESULT / AGENTEVAL_FRAME lines.
//   node tools/agent-eval/remote/score-all.mjs <stageDir> [shard i/N]
import { execFileSync } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { applyStockBuildPatch, basePackageJson } from "../lib/base.mjs";

const require = createRequire("/repo/package.json");
const { chromium } = require("playwright");

const stage = resolve(process.argv[2] ?? ".");
const shard = (process.argv[3] ?? "0/1").split("/").map(Number);
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-score";
const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".ktx2": "image/ktx2" };

const INIT = `(() => {
  window.__RAF__ = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__RAF__++; return cb(t); });
  const c = { draws: 0, maxInstances: 0, tris: 0 };
  window.__GLC__ = c;
  const proto = WebGL2RenderingContext.prototype;
  const wrap = (name, f) => { const o = proto[name]; proto[name] = function (...a) { f(a); return o.apply(this, a); }; };
  const tri = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  wrap('drawArrays', (a) => { c.draws++; c.tris += tri(a[0], a[2]); });
  wrap('drawElements', (a) => { c.draws++; c.tris += tri(a[0], a[1]); });
  wrap('drawArraysInstanced', (a) => { c.draws++; c.maxInstances = Math.max(c.maxInstances, a[3]); c.tris += tri(a[0], a[2]) * a[3]; });
  wrap('drawElementsInstanced', (a) => { c.draws++; c.maxInstances = Math.max(c.maxInstances, a[4]); c.tris += tri(a[0], a[1]) * a[4]; });
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (tag, payload) => console.log(`${tag} ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);

function ensureBase(arm) {
  const baseDir = join(WORK, `base-${arm}`);
  if (!existsSync(join(baseDir, "node_modules"))) {
    mkdirSync(baseDir, { recursive: true });
    const spec = manifest.bases[arm];
    // Score against the same library the agents authored against: staged tarballs win over the published version.
    const tarballs = arm === "aura" && spec.tarballs ? join(stage, spec.tarballs) : null;
    const pkg = basePackageJson(arm, { auraVersion: spec.auraVersion, tarballs });
    writeFileSync(join(baseDir, "package.json"), JSON.stringify(pkg, null, 2));
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: baseDir, stdio: "inherit", timeout: 600000 });
    if (arm === "aura") emit("AGENTEVAL_BASE_SOURCE", { arm, tarballs: spec.tarballs ?? null, engine: (() => { try { return JSON.parse(readFileSync(join(baseDir, "node_modules/@aura3d/engine/package.json"), "utf8")).version; } catch { return null; } })() });
    if (arm === "aura" && spec.patch) emit("AGENTEVAL_BASE", { arm, patch: applyStockBuildPatch(join(baseDir, "node_modules")) });
  }
  return baseDir;
}

function serve(dist) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = normalize(join(dist, url === "/" ? "index.html" : url));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

function bundleSizes(dist) {
  let raw = 0;
  let gz = 0;
  let files = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        const buf = readFileSync(full);
        raw += buf.length;
        gz += gzipSync(buf, { level: 9 }).length;
        files += 1;
      }
    }
  };
  if (existsSync(dist)) walk(dist);
  return { files, rawKB: Math.round(raw / 102.4) / 10, gzipKB: Math.round(gz / 102.4) / 10 };
}

async function analyze(analysis, pngBuffer) {
  return analysis.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    const grid = [];
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      grid.push(Math.round(l));
      sum += l;
    }
    const mean = sum / grid.length;
    const std = Math.sqrt(grid.reduce((a, l) => a + (l - mean) ** 2, 0) / grid.length);
    const j = document.createElement("canvas");
    j.width = 320;
    j.height = 180;
    j.getContext("2d").drawImage(img, 0, 0, 320, 180);
    return { grid, mean, std, jpeg: j.toDataURL("image/jpeg", 0.55).split(",")[1] };
  }, pngBuffer.toString("base64"));
}

const gridDiff = (a, b) => a.grid.reduce((s, v, i) => s + Math.abs(v - b.grid[i]), 0) / a.grid.length;

// Task 2 (10,000 instances) costs several seconds per frame on software GL: it is scored on a reduced canvas and frame plan.
let HEAVY = false;

async function shot(page, analysis) {
  const png = await page.screenshot({ type: "png", timeout: HEAVY ? 240000 : 120000, clip: { x: 0, y: 0, width: HEAVY ? 320 : 640, height: HEAVY ? 180 : 360 }, animations: "allow" });
  return analyze(analysis, png);
}

/** Silhouette of non-background pixels on the 64x36 grid: vertical centre and height in grid rows. */
function silhouette(shotResult) {
  const { grid } = shotResult;
  const border = [];
  for (let x = 0; x < 64; x += 1) border.push(grid[x], grid[35 * 64 + x]);
  for (let y = 0; y < 36; y += 1) border.push(grid[y * 64], grid[y * 64 + 63]);
  border.sort((a, b) => a - b);
  const bg = border[Math.floor(border.length / 2)];
  let top = 36;
  let bottom = -1;
  let sumY = 0;
  let n = 0;
  for (let y = 0; y < 36; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (Math.abs(grid[y * 64 + x] - bg) > 12) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        sumY += y;
        n += 1;
      }
    }
  }
  return n ? { cy: sumY / n, h: bottom - top + 1, n } : { cy: 18, h: 0, n: 0 };
}

async function waitFrames(page, n, timeoutMs = 60000) {
  return page.evaluate(
    ({ n, timeoutMs }) =>
      new Promise((resolve) => {
        const start = window.__RAF__;
        const deadline = Date.now() + timeoutMs;
        const tick = () => (window.__RAF__ >= start + n ? resolve(true) : Date.now() > deadline ? resolve(false) : setTimeout(tick, 50));
        tick();
      }),
    { n, timeoutMs }
  );
}

async function probes(task, page, analysis, ctx) {
  const out = {};
  const evalState = () => page.evaluate(() => (window.__EVAL__ && typeof window.__EVAL__.state === "function" ? window.__EVAL__.state() : null)).catch(() => null);
  const a = await shot(page, analysis);
  out.frameMean = Math.round(a.mean * 10) / 10;
  out.frameStd = Math.round(a.std * 10) / 10;
  out.blank = a.mean < 6 || a.std < 2;
  ctx.frames.push(a.jpeg);
  const cx = 320;
  const cy = 180;
  await waitFrames(page, HEAVY ? 2 : 6, HEAVY ? 120000 : 60000);
  await sleep(HEAVY ? 0 : 500);
  const b = await shot(page, analysis);
  out.animatedDiff = Math.round(gridDiff(a, b) * 100) / 100;
  out.animated = out.animatedDiff > 0.2;
  if (task === 1) {
    // Auto-rotation about the vertical axis confounds a plain frame diff, so orbit is judged on the silhouette: a
    // vertical drag tilts the camera (silhouette height/centre move), a hover with no button must not.
    const base = silhouette(b);
    await page.mouse.move(cx, cy - 40);
    for (let i = 1; i <= 20; i += 1) await page.mouse.move(cx, cy - 40 + i * 8);
    await waitFrames(page, 10);
    await sleep(900);
    const control = await shot(page, analysis);
    const cs = silhouette(control);
    out.controlMoved = Math.round(Math.max(Math.abs(cs.cy - base.cy), Math.abs(cs.h - base.h) / 2) * 100) / 100;
    await page.mouse.move(cx, cy - 40);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) await page.mouse.move(cx, cy - 40 + i * 8);
    await page.mouse.up();
    await waitFrames(page, 10);
    await sleep(900);
    const dragged = await shot(page, analysis);
    const ds = silhouette(dragged);
    out.dragMoved = Math.round(Math.max(Math.abs(ds.cy - cs.cy), Math.abs(ds.h - cs.h) / 2) * 100) / 100;
    out.dragDiff = Math.round(gridDiff(control, dragged) * 100) / 100;
    out.orbitResponds = out.dragMoved >= 1.2 && out.dragMoved > out.controlMoved * 2 + 0.5;
    ctx.frames.push(dragged.jpeg);
  } else {
    ctx.frames.push(b.jpeg);
  }
  const gl = await page.evaluate(() => {
    const c = window.__GLC__;
    const before = { draws: c.draws, tris: c.tris };
    c.draws = 0;
    c.tris = 0;
    c.maxInstances = 0;
    return before;
  });
  await waitFrames(page, 1);
  out.gl = await page.evaluate(() => ({ draws: window.__GLC__.draws, maxInstances: window.__GLC__.maxInstances, tris: Math.round(window.__GLC__.tris) }));
  void gl;
  if (task === 3) {
    const idleShot = await shot(page, analysis);
    await page.keyboard.press("r");
    await waitFrames(page, 12);
    await sleep(600);
    const clipRun = await page.evaluate(() => (window.__EVAL__?.clip ? String(window.__EVAL__.clip()) : null)).catch(() => null);
    const runShot = await shot(page, analysis);
    out.runMotionDiff = Math.round(gridDiff(idleShot, runShot) * 100) / 100;
    out.animated = out.animated || out.runMotionDiff > 0.2;
    await page.keyboard.press("i");
    await waitFrames(page, 6);
    const clipIdle = await page.evaluate(() => (window.__EVAL__?.clip ? String(window.__EVAL__.clip()) : null)).catch(() => null);
    out.clipAfterR = clipRun;
    out.clipAfterI = clipIdle;
    out.clipSwitchWorks = /run/i.test(clipRun ?? "") && /idle/i.test(clipIdle ?? "");
    ctx.frames.push(runShot.jpeg);
  }
  if (task === 4) {
    const s0 = await evalState();
    out.hasState = Boolean(s0 && typeof s0.score === "number" && typeof s0.time === "number");
    out.hudIds = await page.evaluate(() => ["score", "time", "status"].every((id) => document.getElementById(id)));
    if (out.hasState) {
      await page.keyboard.down("ArrowRight");
      await page.evaluate(() => window.__EVAL__.step(120));
      await page.keyboard.up("ArrowRight");
      const s1 = await evalState();
      const advanced = (s1?.time ?? 0) - s0.time;
      out.stepAdvancesTime = advanced >= 1.95 && advanced <= 8;
      await page.keyboard.press("p");
      const paused = await evalState();
      await page.evaluate(() => window.__EVAL__.step(60));
      const stillPaused = await evalState();
      out.pauseFreezes = paused?.status === "paused" && Math.abs((stillPaused?.time ?? 0) - (paused?.time ?? 0)) < 0.05;
      await page.keyboard.press("p");
      await page.keyboard.press("r");
      const s2 = await evalState();
      out.restartResets = s2?.score === 0 && (s2?.time ?? 99) < 1.5 && s2?.status === "playing";
      await page.evaluate(() => window.__EVAL__.step(1900));
      const s3 = await evalState();
      out.endState = s3 ? { status: s3.status, time: Math.round(s3.time * 100) / 100 } : null;
      out.roundEndsAt30 = Boolean(s3 && (s3.status === "lost" || s3.status === "won") && s3.time >= 29.9 && s3.time <= 33);
      out.hudFollowsState = await page.evaluate(() => (document.getElementById("status")?.textContent ?? "").toLowerCase().includes(window.__EVAL__.state().status));
    }
  }
  if (task === 6) {
    out.hasState = Boolean(await evalState());
    const hashes = await page
      .evaluate(() => {
        const e = window.__EVAL__;
        e.reset(1234);
        e.input("right", true);
        e.step(200);
        e.input("right", false);
        e.input("left", true);
        e.step(150);
        e.input("left", false);
        const log = e.record();
        const h1 = e.replay(log);
        const h2 = e.replay(log);
        return { h1: String(h1), h2: String(h2), logLength: Array.isArray(log) ? log.length : -1 };
      })
      .catch((error) => ({ error: String(error.message).slice(0, 120) }));
    out.replay = hashes;
    out.replayDeterministic = Boolean(hashes && !hashes.error && hashes.h1 === hashes.h2 && hashes.h1.length > 0 && hashes.logLength > 0);
    out.pauseButton = await page.evaluate(() => [...document.querySelectorAll("button,[role=button]")].some((el) => /pause/i.test(el.textContent ?? el.getAttribute("aria-label") ?? "")));
  }
  return out;
}

async function scoreSnapshot(browser, snap, baseDir) {
  const t0 = Date.now();
  const work = join(WORK, "snap", snap.id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(stage, snap.dir), work, { recursive: true });
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "snap", private: true, type: "module" }));
  symlinkSync(join(baseDir, "node_modules"), join(work, "node_modules"), "dir");
  for (const asset of manifest.assets[snap.task] ?? []) {
    mkdirSync(join(work, "public/assets"), { recursive: true });
    cpSync(join(stage, "assets", asset), join(work, "public/assets", asset));
  }
  const result = { id: snap.id, run: snap.run, arm: snap.arm, task: snap.task, kind: snap.kind, build: { ok: false } };
  const frames = [];
  try {
    const b0 = Date.now();
    try {
      execFileSync(join(work, "node_modules/.bin/vite"), ["build", "--logLevel", "warn"], { cwd: work, encoding: "utf8", timeout: 300000, maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] });
      result.build = { ok: true, ms: Date.now() - b0 };
    } catch (error) {
      result.build = { ok: false, ms: Date.now() - b0, error: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().slice(-1500) };
      return result;
    }
    result.bundle = bundleSizes(join(work, "dist"));
    const { server, port } = await serve(join(work, "dist"));
    const context = await browser.newContext({ viewport: snap.task === 6 ? { width: 800, height: 600 } : { width: 800, height: 600 }, deviceScaleFactor: 1 });
    await context.addInitScript(INIT);
    HEAVY = snap.task === 2;
    if (HEAVY) {
      await context.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = "canvas{width:320px!important;height:180px!important}";
          document.head.appendChild(style);
        });
      });
    }
    const page = await context.newPage();
    const analysis = await context.newPage();
    await analysis.goto("about:blank");
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));
    page.on("response", (r) => r.status() >= 400 && !r.url().includes("favicon") && failed.push(`${r.status()} ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, "")}`));
    const l0 = Date.now();
    try {
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
      const budget = snap.task === 2 ? 240000 : 120000;
      await page.waitForFunction(() => window.__EVAL_READY__ === true, undefined, { timeout: budget }).then(
        () => (result.readyMs = Date.now() - l0),
        () => (result.readyTimeout = true)
      );
      if (!result.readyTimeout) {
        const ctx = { frames };
        result.probes = await probes(snap.task, page, analysis, ctx);
        if (snap.task === 6) {
          const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
          await mobile.addInitScript(INIT);
          const mp = await mobile.newPage();
          await mp.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
          await mp.waitForFunction(() => window.__EVAL_READY__ === true, undefined, { timeout: 120000 }).catch(() => {});
          result.probes.mobile = await mp
            .evaluate(() => ({ noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1, buttons: document.querySelectorAll("button,[role=button]").length, ready: window.__EVAL_READY__ === true }))
            .catch(() => null);
          await mobile.close();
        }
      }
    } catch (error) {
      result.pageFailure = String(error.message).slice(0, 300);
    }
    result.page = { consoleErrors: consoleErrors.slice(0, 5), consoleErrorCount: consoleErrors.length, pageErrors: pageErrors.slice(0, 5), failedRequests: failed.slice(0, 5) };
    await context.close();
    server.close();
  } finally {
    result.scoreMs = Date.now() - t0;
    emit("AGENTEVAL_RESULT", result);
    frames.slice(0, 3).forEach((jpeg, i) => emit("AGENTEVAL_FRAME", `${snap.id} ${i} ${jpeg}`));
  }
  return result;
}

const mine = manifest.snapshots.filter((_, i) => i % shard[1] === shard[0]);
emit("AGENTEVAL_START", { stage: manifest.batch, shard: shard.join("/"), snapshots: mine.length });
const bases = {};
for (const arm of new Set(mine.map((s) => s.arm))) bases[arm] = ensureBase(arm);
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
for (const snap of mine) {
  try {
    await Promise.race([scoreSnapshot(browser, snap, bases[snap.arm]), sleep(780000).then(() => { throw new Error("snapshot timeout 780s"); })]);
  } catch (error) {
    emit("AGENTEVAL_RESULT", { id: snap.id, run: snap.run, arm: snap.arm, task: snap.task, kind: snap.kind, harnessError: String(error.message).slice(0, 300) });
  }
}
await browser.close();
emit("AGENTEVAL_DONE", { shard: shard.join("/") });
