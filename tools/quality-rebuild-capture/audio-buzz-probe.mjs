#!/usr/bin/env node
// Audio buzz / harshness probe for the 18 games.
//
//   node tools/quality-rebuild-capture/audio-buzz-probe.mjs --base local|<origin> [--games a,b] [--out dir]
//
// `--base local` serves tools/quality-rebuild-capture/.build/site (capture-games
// --build-only output) plus the shared public trees. Any other value is an
// origin (e.g. https://aura3d.auraone.ai) the /apps/<id>/ routes are loaded from.
// Per game: idle (no input) after an F9 keydown gesture, then 5 s of held
// gameplay input. Each phase samples the destination tap ~20x and reports
// mean/max RMS, peak, dominant frequency, >4 kHz share, and the playing voices.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const base = arg("--base", "local");
const outDir = path.resolve(arg("--out", path.join(here, "out-audio")));
const query = arg("--query", "");
const registry = JSON.parse(readFileSync(path.join(here, "games.json"), "utf8"));
const allGames = (registry.games ?? registry).map((g) => g.appDir);
const wanted = (arg("--games", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const games = wanted.length ? allGames.filter((g) => wanted.includes(g)) : allGames;
const gpuArgs = (process.env.QRC_GPU_ARGS || "--headless=new --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist")
  .split(/\s+/).filter(Boolean);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm", ".woff2": "font/woff2" };

function serveLocal() {
  const roots = [path.join(here, ".build", "site"), path.join(repoRoot, "public"),
    path.join(repoRoot, "apps", "aura-clash-showcase", "public"), path.join(repoRoot, "marketing", "public")];
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root))) return null;
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
    const cands = [];
    roots.forEach((r, i) => { cands.push(tryFile(r, p)); if (i > 0 && appRel) cands.push(tryFile(r, appRel)); });
    const file = cands.find(Boolean);
    if (!file) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function samplePhase(page, seconds) {
  const reads = [];
  const n = Math.max(1, Math.round(seconds * 5));
  for (let i = 0; i < n; i += 1) {
    reads.push(await page.evaluate(() => window.__AUDIO_PROBE_SNAPSHOT__?.() ?? null).catch(() => null));
    await sleep(200);
  }
  const ok = reads.filter(Boolean);
  if (!ok.length) return { error: "no probe" };
  const ctxReads = ok.map((r) => r.contexts).flat();
  const rmsVals = ctxReads.map((c) => c.rms);
  const last = ok[ok.length - 1];
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const db = (x) => +(20 * Math.log10(Math.max(x, 1e-7))).toFixed(1);
  const loud = ctxReads.filter((c) => c.rms > 1e-4);
  const domHz = loud.map((c) => c.dominantHz);
  return {
    contexts: last.contexts.length,
    contextState: last.contexts.map((c) => c.state).join(","),
    meanRmsDb: db(mean(rmsVals)),
    maxRmsDb: db(Math.max(0, ...rmsVals)),
    peakDb: db(Math.max(0, ...ctxReads.map((c) => c.peak))),
    hiShare: +mean(loud.map((c) => c.hiShare)).toFixed(3),
    dominantHz: domHz.length ? domHz.sort((a, b) => a - b)[Math.floor(domHz.length / 2)] : null,
    sourcesCreated: last.totalSourcesCreated,
    starts: last.totalStarts,
    playing: last.playingCount,
    looping: last.loopingCount,
    playingSeries: ok.map((r) => r.playingCount),
    media: last.media,
    voices: last.voices.slice(0, 24)
  };
}

async function probeGame(browser, origin, id) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript({ path: path.join(here, "audio-probe-inject.js") });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  const url = `${origin}/apps/${id}/${query}`;
  const result = { id, url };
  try {
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    await sleep(5000);
    result.preGesture = await samplePhase(page, 1);
    await page.keyboard.press("F9");
    await page.mouse.click(4, 4);
    await sleep(3000);
    result.idle3s = await samplePhase(page, 3);
    await sleep(5000);
    result.idle12s = await samplePhase(page, 3);
    const keys = ["ArrowUp", "KeyW", "Space", "ArrowRight"];
    for (const k of keys) await page.keyboard.down(k);
    await page.mouse.click(640, 360);
    const play = samplePhase(page, 5);
    for (let i = 0; i < 8; i += 1) { await page.mouse.click(640 + i * 10, 360); await sleep(400); }
    result.play = await play;
    for (const k of keys) await page.keyboard.up(k);
    await sleep(4000);
    result.afterPlay = await samplePhase(page, 3);
  } catch (e) {
    result.error = String(e.message).slice(0, 300);
  }
  result.pageErrors = errors.slice(0, 5);
  await context.close();
  return result;
}

const fmt = (p) => (p && !p.error
  ? `rms ${p.meanRmsDb}/${p.maxRmsDb} pk ${p.peakDb} hz ${p.dominantHz} hi ${p.hiShare} play ${p.playing} loop ${p.looping} starts ${p.starts} media ${(p.media ?? []).map((m) => `${m.src}${m.loop ? "(loop)" : ""}@${m.volume}`).join(",") || 0}`
  : p?.error ?? "-");

const main = async () => {
  mkdirSync(outDir, { recursive: true });
  const served = base === "local" ? await serveLocal() : null;
  const origin = served ? served.origin : base.replace(/\/$/, "");
  const browser = await chromium.launch({ args: [...gpuArgs, "--autoplay-policy=no-user-gesture-required"] });
  const report = { base, origin, query, at: new Date().toISOString(), games: [] };
  for (const id of games) {
    const r = await probeGame(browser, origin, id);
    report.games.push(r);
    console.log(`${id}\n  idle3s:  ${fmt(r.idle3s)}\n  idle12s: ${fmt(r.idle12s)}\n  play:    ${fmt(r.play)}\n  after:   ${fmt(r.afterPlay)}${r.error ? `\n  ERROR ${r.error}` : ""}`);
    writeFileSync(path.join(outDir, "audio-report.json"), JSON.stringify(report, null, 2));
  }
  await browser.close();
  served?.server.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
