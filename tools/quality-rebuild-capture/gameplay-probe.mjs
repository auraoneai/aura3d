#!/usr/bin/env node
/*
 * Gameplay smoke probe (not a pixel capture): proves the games actually PLAY.
 *
 * Per game x variant: load, wait for ready, sample the game's own state (every evidence/proof
 * global, flattened, plus every runtime node position) for idleMs with NO input, then drive each
 * documented control (gameplay-probe.json) with real keyboard events and record what changed:
 * unprompted drift, input response, sinking (y falling), NaN, fps, key-event delivery.
 *
 * Variants (QRG_VARIANTS, ';'-separated): a flag list served from the local build with exact
 * `a3d-qr=<list>`, `engine-default` (local build, no a3d-qr param) or `prod` (the deployed
 * production build at QRC_BASE_URL, no a3d-qr param: the old-build baseline).
 * Local variants need `capture-games.mjs --build-only` (QRC_LOCAL_BUILD=true) first.
 * Runs on the remote GPU runner (qr-azure-gpu.yml suite=gameplay), never on a developer Mac.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBE_INIT_SCRIPT, probeReady, probeSample } from "./gameplay-probe-page.mjs";
import { analyseRun, summaryRow } from "./gameplay-probe-analyze.mjs";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "..", "..");
const games = JSON.parse(readFileSync(path.join(toolDir, "games.json"), "utf8"));
const probe = JSON.parse(readFileSync(path.join(toolDir, "gameplay-probe.json"), "utf8"));
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);
const DEFAULTS = "core,lighting,camera,materials,assets,animation,post,vfx";
const variants = env("QRG_VARIANTS", "none;defaults;{route};{route},defaults;prod").split(";").map((v) => v.trim()).filter(Boolean);
const requested = env("QRC_GAMES", "").split(",").map((s) => s.trim()).filter(Boolean);
const exclude = new Set(env("QRG_EXCLUDE", "").split(",").map((s) => s.trim()).filter(Boolean));
const selected = games.games.filter((g) => (!requested.length || requested.includes(g.id)) && !exclude.has(g.id) && probe.games[g.id]);
const outDir = path.resolve(repoRoot, env("QRG_OUT", "tools/quality-rebuild-capture/out-gameplay"));
const siteRoot = path.resolve(repoRoot, env("QRC_BUILD_DIR", "tools/quality-rebuild-capture/.build"), "site");
const prodOrigin = new URL(env("QRC_BASE_URL", games.productionOrigin)).origin;
const gpuArgs = env("QRC_GPU_ARGS", env("QR_CHROMIUM_ARGS", "--headless=new --use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist")).split(/\s+/).filter(Boolean);
const SAMPLE_MS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...p) => process.stderr.write(`[qrg ${new Date().toISOString().slice(11, 19)}] ${p.join(" ")}\n`);
const variantLabel = (v) => (v === DEFAULTS ? "defaults" : v.replace(DEFAULTS, "defaults"));

function startServer() {
  const roots = [siteRoot, path.join(repoRoot, "public"), path.join(repoRoot, "apps", "aura-clash-showcase", "public"), path.join(repoRoot, "marketing", "public")];
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
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };
  const server = createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const appRel = /^\/apps\/[^/]+(\/.*)$/.exec(p)?.[1];
    const file = roots.map((r) => tryFile(r, p) ?? (appRel && r !== siteRoot ? tryFile(r, appRel) : null)).find(Boolean);
    if (!file) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** Sample state every SAMPLE_MS while `act` runs (and for at least minMs). */
async function sampled(page, minMs, act) {
  const samples = [];
  const take = async () => { const s = await page.evaluate(probeSample).catch(() => null); if (s) samples.push(s); };
  await take();
  const started = Date.now();
  let done = false;
  const action = (async () => { try { await act?.(); } finally { done = true; } })();
  while (!done || Date.now() - started < minMs) { await sleep(SAMPLE_MS); await take(); }
  await action;
  await take();
  return samples;
}

async function runStep(page, step) {
  if ("wait" in step) await sleep(step.wait);
  else if ("press" in step) await page.keyboard.press(step.press, { delay: 40 });
  else if ("click" in step) await page.locator(step.click).first().click({ timeout: 5000 }).catch(() => undefined);
}

async function drag(page, d) {
  const box = await page.locator(d.selector).first().boundingBox({ timeout: 5000 }).catch(() => null);
  const vp = page.viewportSize();
  const [x, y] = box ? [box.x + box.width / 2, box.y + box.height / 2] : [vp.width / 2, vp.height / 2];
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(x + (d.by[0] * i) / 14, y + (d.by[1] * i) / 14); await sleep((d.ms ?? 600) / 14); }
  await page.mouse.up();
}

async function control(page, c, ms) {
  if (c.drag) { await drag(page, c.drag); await sleep(Math.max(0, ms - (c.drag.ms ?? 600))); return; }
  const mode = c.mode ?? "hold";
  if (mode === "tap") {
    const end = Date.now() + ms;
    while (Date.now() < end) { for (const k of c.keys) await page.keyboard.press(k, { delay: 40 }); await sleep(210); }
    return;
  }
  const holdMs = mode === "charge" ? (c.chargeMs ?? 800) : ms;
  for (const k of c.keys) await page.keyboard.down(k);
  await sleep(holdMs);
  for (const k of [...c.keys].reverse()) await page.keyboard.up(k);
  if (mode === "charge") await sleep(Math.max(0, ms - holdMs));
}

async function probeGame(browser, game, variant, origin) {
  const cfg = probe.games[game.id];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(PROBE_INIT_SCRIPT);
  const page = await context.newPage();
  const run = { variant: variantLabel(variant), url: null, pageErrors: [], consoleErrors: 0 };
  page.on("pageerror", (e) => { if (run.pageErrors.length < 20) run.pageErrors.push(String(e?.message ?? e).slice(0, 300)); });
  page.on("console", (m) => { if (m.type() === "error") run.consoleErrors++; });
  // `{route}` expands to the game's route flag token (games.json qrFlags[0], e.g. route-bank-shot):
  // without it every main.ts boots src/legacy/main.ts; with it, src/v2/boot.ts.
  const flagList = variant.replace(/\{route\}/g, game.qrFlags?.[0] ?? "").replace(/\bdefaults\b/g, DEFAULTS);
  const flags = variant === "prod" || variant === "engine-default" ? "" : `?a3d-qr=${encodeURIComponent(flagList)}`;
  run.url = `${origin}${game.route}${flags}`;
  const gameDir = path.join(outDir, run.variant.replace(/[^a-z0-9-]/gi, "_"));
  mkdirSync(gameDir, { recursive: true });
  try {
    await page.goto(run.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const t0 = Date.now(); let ready = null;
    while (Date.now() - t0 < 45_000) {
      ready = await page.evaluate(probeReady).catch(() => null);
      if (ready && (ready.beacon === "playing" || (ready.beacon === null && ready.draws > 0))) break;
      await sleep(150);
    }
    run.ready = { ...ready, ms: Date.now() - t0 };
    if (game.focus?.selector) {
      const loc = page.locator(game.focus.selector).first();
      if (game.focus.method === "click") await loc.click({ timeout: 5000 }).catch(() => undefined); else await loc.focus({ timeout: 5000 }).catch(() => undefined);
    }
    await sleep(500);
    // Clean frame-rate window: two cheap reads, no state sampling (sampling costs main-thread time).
    const rafAt = () => page.evaluate(() => [performance.now(), window.__GPK__?.raf ?? 0]).catch(() => [0, 0]);
    const [ta, ra] = await rafAt(); await sleep(3000); const [tb, rb] = await rafAt();
    run.fpsClean = tb > ta ? +(((rb - ra) * 1000) / (tb - ta)).toFixed(1) : null;
    const idleMs = cfg.idleMs ?? probe.idleMs; const ctlMs = probe.controlMs;
    const phases = [{ name: "idle", samples: await sampled(page, idleMs) }];
    await page.screenshot({ path: path.join(gameDir, `${game.id}__idle.jpg`), type: "jpeg", quality: 55 }).catch(() => undefined);
    if (cfg.setup?.length) {
      phases.push({ name: "setup", samples: await sampled(page, 0, async () => { for (const s of cfg.setup) await runStep(page, s); }) });
      phases.push({ name: "idle-after-setup", samples: await sampled(page, 2500) });
    }
    for (const c of cfg.controls) {
      const ms = c.ms ?? ctlMs;
      phases.push({ name: c.name, input: c.drag ? `drag ${c.drag.by}` : `${c.mode ?? "hold"} ${c.keys.join("+")}`, samples: await sampled(page, ms, () => control(page, c, ms)) });
      await sleep(500);
    }
    await page.screenshot({ path: path.join(gameDir, `${game.id}__end.jpg`), type: "jpeg", quality: 55 }).catch(() => undefined);
    run.activeElement = phases[0].samples[0]?.active ?? null;
    run.syntheticKeys = phases.at(-1).samples.at(-1)?.keys?.synthetic ?? [];
    run.analysis = analyseRun(phases);
  } catch (e) {
    run.error = String(e?.message ?? e).slice(0, 400);
  } finally {
    await context.close().catch(() => undefined);
  }
  return run;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  mkdirSync(outDir, { recursive: true });
  const needsLocal = variants.some((v) => v !== "prod");
  if (needsLocal && !existsSync(siteRoot)) throw new Error(`no local build at ${siteRoot}; run capture-games.mjs --build-only with QRC_LOCAL_BUILD=true`);
  const local = needsLocal ? await startServer() : null;
  const report = { schema: "aura3d.gameplay-probe/1", generatedAt: new Date().toISOString(), variants: variants.map(variantLabel), prodOrigin, runner: process.env.RUNNER_NAME ?? null, sha: process.env.GITHUB_SHA ?? null, games: {} };
  const rows = [];
  const browser = await chromium.launch({ headless: true, args: [...gpuArgs, "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  try {
    for (const game of selected) {
      report.games[game.id] = {};
      for (const variant of variants) {
        const origin = variant === "prod" ? prodOrigin : local.origin;
        log(`${game.id} [${variantLabel(variant)}]`);
        const run = await probeGame(browser, game, variant, origin);
        report.games[game.id][run.variant] = run;
        rows.push(summaryRow(game.id, run.variant, run));
        log(`  ${rows.at(-1).slice(0, 300)}`);
        writeFileSync(path.join(outDir, "gameplay-report.json"), JSON.stringify(report, null, 1));
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    local?.server.close();
  }
  const md = ["### Gameplay smoke probe", "", "L = state leaves responding (not moving at idle), N = runtime nodes moved, k = keydown/up events seen at window capture/bubble, U = untrusted (synthetic) key events", "", "| game | variant | fps idle | no-input drift | controls | sinking | NaN |", "|---|---|---|---|---|---|---|", ...rows].join("\n");
  writeFileSync(path.join(outDir, "gameplay-summary.md"), `${md}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
