#!/usr/bin/env node
/*
 * Temporal-stability (flicker / over-exposure) probe for the 18 showcase games.
 *
 * Each game is loaded once per qr-flag arm. After the C-24 beacon reports `playing`, the page switches
 * to a virtual clock (flicker/page.mjs): every rAF callback runs on an explicit 16.667 ms tick, so the
 * probe renders the exact frame sequence a 60 Hz display would see even on a 1-25 fps headless runner.
 * Per frame it logs mean luma, clipped fraction (luma >= 250), and mean absolute RGB difference vs the
 * previous frame, plus a 32x18 block-luma grid.
 *
 *   node tools/quality-rebuild-capture/capture-games.mjs --build-only   # builds .build/site
 *   node tools/quality-rebuild-capture/flicker/probe.mjs [--games a,b] [--arms "default;-post"]
 *
 * Remote GPU runner only (launches Chromium); see .github/workflows/qr-flicker-probe.yml.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIRTUAL_CLOCK_SCRIPT, pageFrame, pageDiag } from "./page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const toolDir = path.resolve(here, "..");
const repoRoot = path.resolve(toolDir, "..", "..");
const games = JSON.parse(readFileSync(path.join(toolDir, "games.json"), "utf8")).games;
const argv = process.argv.slice(2);
const opt = (name, env, fallback) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] !== undefined) return argv[i + 1];
  return process.env[env] || fallback;
};
const outDir = path.resolve(repoRoot, opt("--out", "FLK_OUT", "tools/quality-rebuild-capture/out/flicker"));
const buildRoot = path.resolve(repoRoot, opt("--build-dir", "QRC_BUILD_DIR", "tools/quality-rebuild-capture/.build"));
const wanted = opt("--games", "FLK_GAMES", "").split(",").map((s) => s.trim()).filter(Boolean);
const arms = opt("--arms", "FLK_ARMS", "default;-post;-vfx;-animation;-lighting;none").split(";").map((s) => s.trim()).filter(Boolean);
const frames = Number(opt("--frames", "FLK_FRAMES", "120"));
const warmup = Number(opt("--warmup", "FLK_WARMUP", "30"));
const dtMs = Number(opt("--dt", "FLK_DT_MS", "16.6667"));
const [vw, vh] = opt("--viewport", "FLK_VIEWPORT", "1280x720").split("x").map(Number);
const gpuArgs = (process.env.QRC_GPU_ARGS || process.env.QR_CHROMIUM_ARGS || "--use-angle=metal --enable-gpu --ignore-gpu-blocklist").split(/\s+/).filter(Boolean);
for (const arm of arms) if (!/^(default|none|[-A-Za-z0-9_.,]+)$/.test(arm)) throw new Error(`bad arm ${arm}`);
const selected = games.filter((g) => !wanted.length || wanted.includes(g.id));
const log = (...p) => process.stderr.write(`[flk ${new Date().toISOString().slice(11, 19)}] ${p.join(" ")}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const roots = [path.join(buildRoot, "site"), path.join(repoRoot, "public"),
    path.join(repoRoot, "apps", "aura-clash-showcase", "public"), path.join(repoRoot, "marketing", "public")];
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
    ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root) + path.sep)) return null;
    try {
      const st = statSync(full);
      if (st.isFile()) return full;
      if (st.isDirectory() && existsSync(path.join(full, "index.html"))) return path.join(full, "index.html");
    } catch { /* missing */ }
    return null;
  };
  const server = createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const appRel = /^\/apps\/[^/]+(\/.*)$/.exec(p)?.[1];
    let file = null;
    for (const root of roots) { file = tryFile(root, p) ?? (appRel && root !== roots[0] ? tryFile(root, appRel) : null); if (file) break; }
    if (!file) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

const std = (xs) => { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const r3 = (v) => +Number(v).toFixed(3);

export function summarize(list) {
  const luma = list.map((f) => f.luma);
  const d1 = luma.slice(1).map((v, i) => v - luma[i]);
  const d2 = d1.slice(1).map((v, i) => v - d1[i]);
  const mad = list.map((f) => f.mad).filter((v) => v !== null);
  // Sign flips of the luma delta (above a 0.05 noise floor): strobing alternates, motion drifts.
  let flips = 0;
  for (let i = 1; i < d1.length; i++) if (Math.abs(d1[i]) > 0.05 && Math.abs(d1[i - 1]) > 0.05 && Math.sign(d1[i]) !== Math.sign(d1[i - 1])) flips++;
  // Grid-level flicker: per cell, std of the second temporal difference; report the worst cells.
  const cells = list[0]?.grid?.length ?? 0;
  const cellHf = [];
  for (let c = 0; c < cells; c++) {
    const s = list.map((f) => f.grid[c]);
    const e1 = s.slice(1).map((v, i) => v - s[i]);
    cellHf.push({ c, hf: std(e1.slice(1).map((v, i) => v - e1[i])), mean: s.reduce((a, b) => a + b, 0) / s.length });
  }
  cellHf.sort((a, b) => b.hf - a.hf);
  return {
    frames: list.length,
    lumaMin: r3(Math.min(...luma)), lumaMax: r3(Math.max(...luma)), lumaMean: r3(luma.reduce((a, b) => a + b, 0) / luma.length),
    deltaStd: r3(std(d1)), deltaMaxAbs: r3(Math.max(0, ...d1.map(Math.abs))), hfStd: r3(std(d2)), signFlips: flips,
    madMean: r3(mad.reduce((a, b) => a + b, 0) / Math.max(1, mad.length)), madMax: r3(Math.max(0, ...mad)),
    bigDiffMean: r3(list.reduce((a, f) => a + (f.bigDiff ?? 0), 0) / list.length),
    clipMean: r3(list.reduce((a, f) => a + f.clip, 0) / list.length), clipMax: r3(Math.max(...list.map((f) => f.clip))),
    clipAnyMean: r3(list.reduce((a, f) => a + f.clipAny, 0) / list.length),
    stalled: list.filter((f) => f.waited >= 1500).length,
    worstCells: cellHf.slice(0, 5).map((x) => ({ cell: x.c, x: x.c % 32, y: Math.floor(x.c / 32), hf: r3(x.hf), mean: r3(x.mean) }))
  };
}

async function probeArm(browser, game, arm, origin, gameDir) {
  const url = `${origin}${game.route}${arm === "default" ? "" : `?a3d-qr=${encodeURIComponent(arm)}`}`;
  const rec = { arm, url, frames: [], diag: [], pageErrors: [], consoleErrors: [] };
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(VIRTUAL_CLOCK_SCRIPT);
  const page = await context.newPage();
  page.on("pageerror", (e) => rec.pageErrors.length < 20 && rec.pageErrors.push(String(e?.message ?? e).slice(0, 300)));
  page.on("console", (m) => m.type() === "error" && rec.consoleErrors.length < 20 && rec.consoleErrors.push(m.text().slice(0, 300)));
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const start = Date.now();
    let state = null;
    while (Date.now() - start < 60_000) {
      state = await page.evaluate(() => window.__AURA3D_GAME__?.state ?? null).catch(() => null);
      if (state === "playing") break;
      await sleep(200);
    }
    rec.ready = state;
    await sleep(1500);
    await page.evaluate(() => window.__FLK__.enter());
    await sleep(300);
    for (let i = 0; i < warmup; i++) await page.evaluate(pageFrame, { dtMs, keepPng: false, grid: [32, 18] });
    for (let i = 0; i < frames; i++) {
      const keepPng = i < 3 || i === 60;
      const f = await page.evaluate(pageFrame, { dtMs, keepPng, grid: [32, 18] });
      if (f.png) {
        writeFileSync(path.join(gameDir, `${arm.replace(/[^A-Za-z0-9_-]/g, "_")}__f${String(i).padStart(3, "0")}.png`), Buffer.from(f.png.split(",")[1], "base64"));
        delete f.png;
      }
      rec.frames.push(f);
      if (i % 10 === 0) rec.diag.push({ i, ...(await page.evaluate(pageDiag).catch(() => null)) });
    }
    rec.clockErrors = await page.evaluate(() => window.__FLK__.errors).catch(() => null);
    rec.summary = summarize(rec.frames.filter((f) => !f.error));
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 400);
  } finally {
    await context.close().catch(() => undefined);
  }
  return rec;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  mkdirSync(outDir, { recursive: true });
  const { server, origin } = await startServer();
  const summary = { generatedAt: new Date().toISOString(), dtMs, frames, warmup, viewport: [vw, vh], arms, games: {} };
  for (const game of selected) {
    const gameDir = path.join(outDir, game.id);
    mkdirSync(gameDir, { recursive: true });
    const browser = await chromium.launch({ headless: true, args: [...gpuArgs, "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"] });
    summary.games[game.id] = {};
    try {
      for (const arm of arms) {
        const t = Date.now();
        const rec = await probeArm(browser, game, arm, origin, gameDir);
        writeFileSync(path.join(gameDir, `${arm.replace(/[^A-Za-z0-9_-]/g, "_")}.json`), JSON.stringify(rec));
        summary.games[game.id][arm] = rec.summary ? { ready: rec.ready, ...rec.summary, pageErrors: rec.pageErrors.length } : { ready: rec.ready, error: rec.error ?? "no frames" };
        const s = rec.summary;
        log(`${game.id} ${arm}: ${s ? `luma ${s.lumaMin}-${s.lumaMax} dStd ${s.deltaStd} hf ${s.hfStd} flips ${s.signFlips} mad ${s.madMean} clip ${s.clipMean}` : rec.error} (${Math.round((Date.now() - t) / 1000)}s)`);
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
    writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  }
  server.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
}
