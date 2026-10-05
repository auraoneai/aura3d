#!/usr/bin/env node
/*
 * Aura3D quality-rebuild visual capture harness.
 *
 * Plays the 18 showcase games with real keyboard/pointer input (timelines in games.json),
 * captures labelled screenshots at desktop 1920x1080, desktop 1280x720 and mobile 390x844 @3x,
 * and records console errors, page errors, failed requests, load-to-first-frame timing, a 5s
 * requestAnimationFrame FPS sample, the WebGL renderer string, canvas size and DPR.
 *
 * Designed for a remote GPU runner (GitHub Actions macos-14, ANGLE Metal). Do not run it on a
 * developer Mac: it launches Chromium and holds GPU-heavy pages open for ~30 minutes.
 *
 *   node tools/quality-rebuild-capture/capture-games.mjs                 # 17 production + Orbital from source
 *   node tools/quality-rebuild-capture/capture-games.mjs --build-only    # only build the local-source games
 *   node tools/quality-rebuild-capture/capture-games.mjs --skip-build    # reuse .build/ output
 *   node tools/quality-rebuild-capture/capture-games.mjs --local-build   # build + serve all selected games from source
 *   node tools/quality-rebuild-capture/capture-games.mjs --games showcase-bank-shot,aura-clash-showcase
 *   node tools/quality-rebuild-capture/capture-games.mjs --validate      # schema-check games.json, no browser
 *
 * Output: <out>/<game>/<run>__<shot>.png, <out>/<game>/contact-sheet.png|html, <out>/report.json,
 * <out>/index.html. Exit code is 0 unless --strict is passed and a game failed to capture.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "..", "..");
const gamesConfig = JSON.parse(readFileSync(path.join(toolDir, "games.json"), "utf8"));
const defaults = gamesConfig.defaults ?? {};

// ---------------------------------------------------------------------------------------------
// CLI / environment
// ---------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, envName, fallback) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const envValue = envName ? process.env[envName] : undefined;
  return envValue !== undefined && envValue !== "" ? envValue : fallback;
};
const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? ""));

const outDir = path.resolve(repoRoot, opt("--out", "QRC_OUT", "tools/quality-rebuild-capture/out"));
const buildRoot = path.resolve(repoRoot, opt("--build-dir", "QRC_BUILD_DIR", "tools/quality-rebuild-capture/.build"));
const productionOrigin = validateOrigin(opt("--base-url", "QRC_BASE_URL", gamesConfig.productionOrigin));
const localBuildAll = flag("--local-build") || truthy(process.env.QRC_LOCAL_BUILD);
const buildOnly = flag("--build-only");
const skipBuild = flag("--skip-build") || truthy(process.env.QRC_SKIP_BUILD);
const strict = flag("--strict");
const validateOnly = flag("--validate");
const includeMobile = !flag("--no-mobile") && !truthy(process.env.QRC_NO_MOBILE);
const includeAlt = !flag("--no-alt-routes");
const channel = opt("--channel", "QRC_CHANNEL", "chromium");
const executablePath = opt("--executable", "QRC_EXECUTABLE", "");
const gpuArgs = opt("--gpu-args", "QRC_GPU_ARGS", "--use-angle=metal --enable-gpu --ignore-gpu-blocklist")
  .split(/\s+/).filter(Boolean);
const gameTimeoutMs = Number(opt("--game-timeout", "QRC_GAME_TIMEOUT_MS", "420000"));
const runTimeoutMs = Number(opt("--run-timeout", "QRC_RUN_TIMEOUT_MS", "150000"));
const desktopViewports = opt("--viewports", "QRC_VIEWPORTS", "1920x1080,1280x720")
  .split(",").map((s) => s.trim()).filter(Boolean).map(parseViewport);

const knownIds = new Set(gamesConfig.games.map((g) => g.id));
const requestedIds = opt("--games", "QRC_GAMES", "").split(",").map((s) => s.trim()).filter(Boolean);
for (const id of requestedIds) {
  if (!knownIds.has(id)) {
    console.error(`unknown game id "${id}". Known: ${[...knownIds].join(", ")}`);
    process.exit(2);
  }
}
const selectedGames = gamesConfig.games.filter((g) => requestedIds.length === 0 || requestedIds.includes(g.id));
const isLocal = (game) => localBuildAll || game.deployed === false;

function validateOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`--base-url is not a URL: ${value}`); }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`--base-url must be http(s): ${value}`);
  return url.origin;
}

function parseViewport(spec) {
  const m = /^(\d{3,4})x(\d{3,4})(?:@(\d(?:\.\d+)?))?$/.exec(spec);
  if (!m) throw new Error(`bad viewport "${spec}" (expected WIDTHxHEIGHT[@DPR])`);
  return { name: `desktop-${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]), dpr: Number(m[3] ?? 1), mobile: false };
}

const MOBILE_RUN = { name: "mobile-390x844", width: 390, height: 844, dpr: 3, mobile: true };
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const log = (...parts) => process.stderr.write(`[qrc ${new Date().toISOString().slice(11, 19)}] ${parts.join(" ")}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// games.json validation
// ---------------------------------------------------------------------------------------------
const STEP_KEYS = ["wait", "press", "down", "up", "hold", "shot", "until", "drag", "click", "focus", "tap", "repeat", "fps", "releaseAll", "mouse"];

function validateTimeline(game) {
  const problems = [];
  const shots = [];
  const walk = (steps, where) => {
    if (!Array.isArray(steps)) { problems.push(`${where}: steps must be an array`); return; }
    steps.forEach((step, index) => {
      const at = `${where}[${index}]`;
      const kind = STEP_KEYS.find((k) => k in step);
      if (!kind) { problems.push(`${at}: unknown step ${JSON.stringify(step)}`); return; }
      if (kind === "shot") {
        if (!/^[0-9a-z][0-9a-z-]*$/.test(step.shot)) problems.push(`${at}: shot name must be kebab-case: ${step.shot}`);
        shots.push(step.shot);
      }
      if (kind === "repeat") {
        if (!Number.isInteger(step.repeat) || step.repeat < 1 || step.repeat > 200) problems.push(`${at}: repeat must be 1..200`);
        const before = shots.length;
        walk(step.steps, `${at}.steps`);
        if (shots.length !== before) problems.push(`${at}: shots inside repeat would collide`);
      }
      if (kind === "until") {
        if (typeof step.until !== "string") problems.push(`${at}: until must be a JS expression string`);
        if (step.loop) walk(step.loop, `${at}.loop`);
      }
      if (kind === "drag") {
        const d = step.drag;
        if (!Array.isArray(d?.by) || d.by.length !== 2) problems.push(`${at}: drag.by must be [dx, dy]`);
        if (d?.shotBeforeRelease) shots.push(d.shotBeforeRelease);
      }
      if (kind === "wait" && !(step.wait >= 0 && step.wait <= 60000)) problems.push(`${at}: wait out of range`);
      if (kind === "hold" && !(step.ms > 0 && step.ms <= 60000)) problems.push(`${at}: hold needs ms`);
    });
  };
  walk(game.timeline, `${game.id}.timeline`);
  const dupes = shots.filter((s, i) => shots.indexOf(s) !== i);
  if (dupes.length) problems.push(`${game.id}: duplicate shot names ${dupes.join(", ")}`);
  for (const required of defaults.requiredShots ?? []) {
    if (!shots.includes(required)) problems.push(`${game.id}: missing required shot ${required}`);
  }
  if (!game.route?.startsWith("/")) problems.push(`${game.id}: route must start with /`);
  if (!existsSync(path.join(repoRoot, "apps", game.appDir, "index.html"))) problems.push(`${game.id}: apps/${game.appDir}/index.html missing`);
  return { problems, shots };
}

const validation = gamesConfig.games.map((g) => ({ id: g.id, ...validateTimeline(g) }));
const allProblems = validation.flatMap((v) => v.problems);
if (validateOnly) {
  for (const v of validation) console.log(`${v.id}: ${v.shots.length} shots (${v.shots.join(", ")})`);
  if (allProblems.length) { console.error(allProblems.join("\n")); process.exit(1); }
  console.log(`games.json OK: ${gamesConfig.games.length} games`);
  process.exit(0);
}
if (allProblems.length) { console.error(allProblems.join("\n")); process.exit(1); }

// ---------------------------------------------------------------------------------------------
// Local build (vite) + static server
// ---------------------------------------------------------------------------------------------
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

function writeWrapperConfig(game) {
  const appDir = path.join(repoRoot, "apps", game.appDir);
  const appConfig = path.join(appDir, "vite.config.ts");
  const sourceConfig = existsSync(appConfig) ? appConfig : path.join(repoRoot, "vite.config.ts");
  const outputDir = path.join(buildRoot, "site", "apps", game.appDir);
  const configDir = path.join(buildRoot, "configs");
  mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, `${game.id}.vite.config.mjs`);
  // Reuse the app's own config (aliases, plugins, chunking) but pin root/base/outDir and skip the
  // shared multi-GB publicDir copy: the static server below serves public/ directly instead.
  writeFileSync(configPath, `import sourceConfig from ${JSON.stringify(sourceConfig)};

const resolved = typeof sourceConfig === "function"
  ? await sourceConfig({ command: "build", mode: "production", isSsrBuild: false, isPreview: false })
  : sourceConfig;
const build = resolved.build ?? {};
const rollupOptions = build.rollupOptions ?? {};

export default {
  ...resolved,
  root: ${JSON.stringify(appDir)},
  base: ${JSON.stringify(`/apps/${game.appDir}/`)},
  publicDir: false,
  logLevel: "warn",
  build: {
    ...build,
    outDir: ${JSON.stringify(outputDir)},
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { ...rollupOptions, input: rollupOptions.input ?? ${JSON.stringify(path.join(appDir, "index.html"))} }
  }
};
`, "utf8");
  return { configPath, outputDir };
}

function buildGame(game) {
  const started = Date.now();
  const { configPath, outputDir } = writeWrapperConfig(game);
  log(`build ${game.id} -> ${path.relative(repoRoot, outputDir)}`);
  const result = spawnSync(process.execPath, ["--max-old-space-size=6144", viteBin, "build", "--config", configPath], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0" },
    encoding: "utf8",
    timeout: 20 * 60_000,
    maxBuffer: 64 * 1024 * 1024
  });
  const ok = result.status === 0 && existsSync(path.join(outputDir, "index.html"));
  const tail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
  if (!ok) log(`build FAILED ${game.id} (status ${result.status}${result.error ? `, ${result.error.message}` : ""})\n${tail}`);
  return { id: game.id, ok, status: result.status, seconds: Math.round((Date.now() - started) / 1000), outputDir, logTail: ok ? undefined : tail };
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json", ".wasm": "application/wasm",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2",
  ".hdr": "application/octet-stream", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon"
};

function startStaticServer() {
  const siteRoot = path.join(buildRoot, "site");
  // Absolute /aura-assets/, /assets/draco/ etc. resolve against the same public trees the dev
  // server and marketing build use. Order matters: built output wins.
  const fallbackRoots = [
    path.join(repoRoot, "public"),
    path.join(repoRoot, "apps", "aura-clash-showcase", "public"),
    path.join(repoRoot, "marketing", "public")
  ];
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) return null;
    try {
      const st = statSync(full);
      if (st.isFile()) return full;
      if (st.isDirectory() && existsSync(path.join(full, "index.html"))) return path.join(full, "index.html");
    } catch { /* missing */ }
    return null;
  };
  const server = createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname.includes("\0")) { res.writeHead(400).end(); return; }
    const appPrefix = /^\/apps\/[^/]+(\/.*)$/.exec(pathname)?.[1];
    const candidates = [tryFile(siteRoot, pathname)];
    for (const root of fallbackRoots) {
      candidates.push(tryFile(root, pathname));
      if (appPrefix) candidates.push(tryFile(root, appPrefix));
    }
    const file = candidates.find(Boolean);
    if (!file) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
      "cross-origin-resource-policy": "same-origin"
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---------------------------------------------------------------------------------------------
// In-page instrumentation (runs before any app script)
// ---------------------------------------------------------------------------------------------
const INIT_SCRIPT = `(() => {
  if (window.__QRC__) return;
  const qrc = window.__QRC__ = { firstContextAt: null, firstDrawAt: null, firstGpuSubmitAt: null, contexts: [], glRef: null };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = origGetContext.call(this, type, attrs);
    try {
      if (ctx && /webgl|webgpu/i.test(String(type))) {
        if (qrc.firstContextAt === null) qrc.firstContextAt = performance.now();
        if (qrc.contexts.length < 8) qrc.contexts.push({ type: String(type), at: Math.round(performance.now()), width: this.width, height: this.height });
        if (!qrc.glRef && /webgl/i.test(String(type))) qrc.glRef = ctx;
      }
    } catch {}
    return ctx;
  };
  const restores = [];
  const restoreAll = () => { while (restores.length) { try { restores.pop()(); } catch {} } };
  const names = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"];
  for (const Ctor of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctor) continue;
    for (const name of names) {
      const orig = Ctor.prototype[name];
      if (typeof orig !== "function") continue;
      Ctor.prototype[name] = function (...args) {
        if (qrc.firstDrawAt === null) { qrc.firstDrawAt = performance.now(); restoreAll(); }
        return orig.apply(this, args);
      };
      restores.push(() => { Ctor.prototype[name] = orig; });
    }
  }
  if (window.GPUQueue && typeof GPUQueue.prototype.submit === "function") {
    const origSubmit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (...args) {
      if (qrc.firstGpuSubmitAt === null) { qrc.firstGpuSubmitAt = performance.now(); GPUQueue.prototype.submit = origSubmit; }
      return origSubmit.apply(this, args);
    };
  }
})();`;

/** Evaluated in page: readiness signals. */
function pageReadiness() {
  const canvases = [...document.querySelectorAll("canvas")];
  let liveDrawCalls = null;
  let liveApps = 0;
  try {
    const registry = globalThis.__AURA3D_LIVE_APPS__;
    if (registry?.all) {
      const apps = registry.all();
      liveApps = apps.length;
      for (const app of apps) {
        try { liveDrawCalls = Math.max(liveDrawCalls ?? 0, Number(app.diagnostics()?.drawCalls ?? 0)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  const q = window.__QRC__ ?? {};
  return {
    now: performance.now(),
    canvasCount: canvases.length,
    liveApps,
    liveDrawCalls,
    firstDrawAt: q.firstDrawAt ?? null,
    firstGpuSubmitAt: q.firstGpuSubmitAt ?? null,
    firstContextAt: q.firstContextAt ?? null
  };
}

/** Evaluated in page: renderer, canvas, DPR, engine diagnostics, evidence summary, heap. */
function pageSnapshot(evidenceGlobal) {
  const out = { dpr: window.devicePixelRatio, inner: [window.innerWidth, window.innerHeight] };
  const canvases = [...document.querySelectorAll("canvas")].map((c) => {
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), area: c.width * c.height };
  }).sort((a, b) => b.area - a.area);
  out.canvasCount = canvases.length;
  out.canvas = canvases[0] ?? null;
  const readGl = (gl) => {
    if (!gl) return null;
    try {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        antialias: gl.getContextAttributes?.()?.antialias ?? null
      };
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  };
  out.appGl = readGl(window.__QRC__?.glRef);
  if (!window.__QRC_PROBE_GL__) {
    try {
      const c = document.createElement("canvas");
      window.__QRC_PROBE_GL__ = readGl(c.getContext("webgl2") ?? c.getContext("webgl")) ?? { error: "no webgl context" };
    } catch (e) { window.__QRC_PROBE_GL__ = { error: String(e).slice(0, 120) }; }
  }
  out.probeGl = window.__QRC_PROBE_GL__;
  out.webgpuAvailable = Boolean(navigator.gpu);
  out.contexts = window.__QRC__?.contexts ?? [];
  try {
    const registry = globalThis.__AURA3D_LIVE_APPS__;
    out.engine = registry?.all ? registry.all().map((app) => {
      try {
        const d = app.diagnostics();
        const assets = Array.isArray(d.assets) ? d.assets : [];
        const byStatus = {};
        for (const a of assets) { const k = String(a?.status ?? a?.state ?? "unknown"); byStatus[k] = (byStatus[k] ?? 0) + 1; }
        return { backend: d.backend, fps: d.fps, drawCalls: d.drawCalls, renderSize: d.renderSize, assets: byStatus,
          warnings: (d.warnings ?? []).length, warningSample: (d.warnings ?? []).slice(0, 4), errors: (d.errors ?? []).slice(0, 6) };
      } catch (e) { return { error: String(e).slice(0, 160) }; }
    }) : null;
  } catch (e) { out.engine = { error: String(e).slice(0, 160) }; }
  const summarize = (value) => {
    if (!value || typeof value !== "object") return value ?? null;
    const flat = {};
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      if (n >= 60) break;
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
        flat[k] = typeof v === "string" ? v.slice(0, 160) : v; n++;
      } else if (Array.isArray(v)) {
        flat[k] = `[array ${v.length}]`; n++;
      } else if (typeof v === "object" && ["renderer", "player", "rival", "van", "gameplay", "controls"].includes(k)) {
        const sub = {};
        for (const [k2, v2] of Object.entries(v).slice(0, 20)) if (v2 === null || ["string", "number", "boolean"].includes(typeof v2)) sub[k2] = v2;
        flat[k] = sub; n++;
      }
    }
    return flat;
  };
  const evidenceKeys = Object.keys(window).filter((k) => /^__[A-Z0-9_]*(EVIDENCE|PROOF|SHOWCASE)[A-Z0-9_]*__$/.test(k));
  if (evidenceGlobal && !evidenceKeys.includes(evidenceGlobal)) evidenceKeys.unshift(evidenceGlobal);
  out.evidence = {};
  for (const key of evidenceKeys.slice(0, 6)) {
    try { const v = window[key]; if (typeof v !== "function") out.evidence[key] = summarize(v); } catch { /* ignore */ }
  }
  const mem = performance.memory;
  if (mem) out.jsHeapMB = Math.round(mem.usedJSHeapSize / 1048576);
  out.bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300);
  return out;
}

function pageStartFps(durationMs) {
  const state = window.__QRC_FPS__ = { durationMs, stamps: [], done: false, startedAt: performance.now() };
  const tick = (t) => {
    state.stamps.push(t);
    if (t - state.stamps[0] < durationMs) requestAnimationFrame(tick); else state.done = true;
  };
  requestAnimationFrame(tick);
  return true;
}

function pageReadFps() {
  const s = window.__QRC_FPS__;
  if (!s || s.stamps.length < 2) return s ? { done: s.done, frames: s.stamps.length } : null;
  const st = s.stamps;
  const deltas = [];
  for (let i = 1; i < st.length; i++) deltas.push(st[i] - st[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const span = st[st.length - 1] - st[0];
  return {
    done: s.done,
    frames: st.length,
    spanMs: Math.round(span),
    fps: +(((st.length - 1) / span) * 1000).toFixed(1),
    frameMsP50: +pct(0.5).toFixed(2),
    frameMsP95: +pct(0.95).toFixed(2),
    frameMsP99: +pct(0.99).toFixed(2),
    frameMsMax: +sorted[sorted.length - 1].toFixed(2),
    framesOver33ms: deltas.filter((d) => d > 33.4).length,
    framesOver50ms: deltas.filter((d) => d > 50).length
  };
}

/**
 * Evaluate a games.json expression string in the page. Passing a string (not a function that calls
 * eval) goes through CDP Runtime.evaluate, which a route's Content-Security-Policy cannot block.
 */
function evaluateExpression(page, expr) {
  return page.evaluate(`(() => { try { return (${expr}); } catch (e) { return null; } })()`).catch(() => null);
}

// ---------------------------------------------------------------------------------------------
// PNG stats (decoder for the 8-bit non-interlaced PNGs Chromium emits)
// ---------------------------------------------------------------------------------------------
function pngStats(buffer) {
  try {
    if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
    let off = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0;
    const idat = [];
    while (off < buffer.length) {
      const len = buffer.readUInt32BE(off); const type = buffer.toString("ascii", off + 4, off + 8);
      const data = buffer.subarray(off + 8, off + 8 + len);
      if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
      else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
      off += 12 + len;
    }
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
    if (bitDepth !== 8 || !channels || interlace !== 0) return { width, height, unsupported: `bitDepth=${bitDepth} colorType=${colorType}` };
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const cur = Buffer.alloc(stride); const prev = Buffer.alloc(stride);
    let sum = 0; let sumSq = 0; let n = 0; let dark = 0; let bright = 0;
    const colors = new Set();
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 250000)));
    for (let y = 0; y < height; y++) {
      const base = y * (stride + 1); const filter = raw[base];
      for (let x = 0; x < stride; x++) {
        const v = raw[base + 1 + x];
        const a = x >= channels ? cur[x - channels] : 0; const b = prev[x]; const c = x >= channels ? prev[x - channels] : 0;
        let r;
        switch (filter) {
          case 1: r = v + a; break;
          case 2: r = v + b; break;
          case 3: r = v + ((a + b) >> 1); break;
          case 4: { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
          default: r = v;
        }
        cur[x] = r & 0xff;
      }
      if (y % step === 0) {
        for (let x = 0; x < width; x += step) {
          const i = x * channels;
          const R = cur[i]; const G = channels >= 3 ? cur[i + 1] : R; const B = channels >= 3 ? cur[i + 2] : R;
          const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          sum += l; sumSq += l * l; n++;
          if (l < 10) dark++; if (l > 245) bright++;
          colors.add(((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4));
        }
      }
      cur.copy(prev);
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    return {
      width, height,
      meanLuma: +mean.toFixed(1), lumaStd: +std.toFixed(1),
      darkFraction: +(dark / n).toFixed(3), brightFraction: +(bright / n).toFixed(3),
      distinctColors4bit: colors.size,
      likelyBlank: std < 3 || colors.size < 6
    };
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
}

// ---------------------------------------------------------------------------------------------
// Timeline runner
// ---------------------------------------------------------------------------------------------
class Timeline {
  constructor(page, run, game, gameDir, record, stopAfterShot) {
    this.page = page; this.run = run; this.game = game; this.gameDir = gameDir; this.record = record;
    this.stopAfterShot = stopAfterShot; this.stopped = false; this.t0 = 0; this.held = new Set();
  }

  elapsed() { return Date.now() - this.t0; }

  async shot(name) {
    const file = path.join(this.gameDir, `${this.run.name}__${name}.png`);
    const entry = { name, tMs: this.t0 ? this.elapsed() : 0, file: path.relative(outDir, file) };
    try {
      const buffer = await this.page.screenshot({ path: file, type: "png", timeout: 20_000, animations: "allow", caret: "initial" });
      entry.pixels = pngStats(buffer);
      entry.state = await this.page.evaluate(pageSnapshot, this.game.evidenceGlobal ?? null).catch((e) => ({ error: String(e).slice(0, 160) }));
      // Keep the heavy probe GL block once per run, not per shot.
      if (entry.state && !entry.state.error) { delete entry.state.probeGl; delete entry.state.contexts; }
    } catch (e) {
      entry.error = String(e?.message ?? e).slice(0, 240);
    }
    this.record.shots.push(entry);
    if (this.stopAfterShot && name === this.stopAfterShot) this.stopped = true;
  }

  async keyDown(code) { await this.page.keyboard.down(code); this.held.add(code); }
  async keyUp(code) { await this.page.keyboard.up(code); this.held.delete(code); }

  async releaseAll() {
    for (const code of [...this.held]) await this.keyUp(code).catch(() => undefined);
    await this.page.mouse.up().catch(() => undefined);
  }

  async elementPoint(selector, fx = 0.5, fy = 0.5) {
    if (selector) {
      const box = await this.page.locator(selector).first().boundingBox({ timeout: 5_000 }).catch(() => null);
      if (box) return [box.x + box.width * fx, box.y + box.height * fy];
    }
    return [this.run.width * fx, this.run.height * fy];
  }

  async exec(steps) {
    for (const step of steps) {
      if (this.stopped) return;
      if ("wait" in step) await sleep(step.wait);
      else if ("press" in step) await this.page.keyboard.press(step.press, { delay: step.delay ?? 30 });
      else if ("down" in step) await this.keyDown(step.down);
      else if ("up" in step) await this.keyUp(step.up);
      else if ("hold" in step) {
        const codes = Array.isArray(step.hold) ? step.hold : [step.hold];
        for (const c of codes) await this.keyDown(c);
        await sleep(step.ms);
        for (const c of [...codes].reverse()) await this.keyUp(c);
      } else if ("shot" in step) await this.shot(step.shot);
      else if ("fps" in step) await this.page.evaluate(pageStartFps, step.fps || defaults.fpsSampleMs || 5000).catch(() => undefined);
      else if ("releaseAll" in step) await this.releaseAll();
      else if ("focus" in step) await this.page.locator(step.focus).first().focus({ timeout: 5_000 }).catch(() => undefined);
      else if ("click" in step) await this.page.locator(step.click).first().click({ timeout: 5_000 }).catch(() => undefined);
      else if ("tap" in step) await this.page.locator(step.tap).first().tap({ timeout: 5_000 }).catch(() => undefined);
      else if ("repeat" in step) { for (let i = 0; i < step.repeat && !this.stopped; i++) await this.exec(step.steps); }
      else if ("mouse" in step) {
        const [x, y] = await this.elementPoint(step.mouse.selector, step.mouse.from?.[0], step.mouse.from?.[1]);
        await this.page.mouse.move(x, y);
        await this.page.mouse.down({ button: step.mouse.button ?? "left" });
        await sleep(step.mouse.ms ?? 300);
        await this.page.mouse.up({ button: step.mouse.button ?? "left" });
      } else if ("drag" in step) {
        const d = step.drag;
        const [x, y] = await this.elementPoint(d.selector, d.from?.[0] ?? 0.5, d.from?.[1] ?? 0.5);
        await this.page.mouse.move(x, y);
        await this.page.mouse.down();
        const stepsN = d.steps ?? 12;
        for (let i = 1; i <= stepsN; i++) {
          await this.page.mouse.move(x + (d.by[0] * i) / stepsN, y + (d.by[1] * i) / stepsN);
          await sleep((d.ms ?? 500) / stepsN);
        }
        if (d.shotBeforeRelease) await this.shot(d.shotBeforeRelease);
        if (this.stopped) { await this.page.mouse.up(); return; }
        await this.page.mouse.up();
      } else if ("until" in step) {
        const evalExpr = (expr) => evaluateExpression(this.page, expr);
        const s = step.capture ? await evalExpr(step.capture) : null;
        const t = step.capture2 ? await evalExpr(step.capture2) : null;
        const test = `(() => { const s = ${JSON.stringify(s)}; const t = ${JSON.stringify(t)}; return Boolean(${step.until}); })()`;
        const started = Date.now();
        let hit = false;
        while (Date.now() - started < (step.timeout ?? 5000)) {
          if (await evalExpr(test)) { hit = true; break; }
          if (step.loop?.length) await this.exec(step.loop); else await sleep(80);
          if (this.stopped) break;
        }
        this.record.conditions.push({ until: step.until, hit, waitedMs: Date.now() - started, atMs: this.elapsed(), baseline: s, baseline2: t });
      }
    }
  }

  async play(timeline) {
    this.t0 = Date.now();
    try {
      await this.exec(timeline);
    } finally {
      await this.releaseAll();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// One run = fresh context + navigation + readiness + title + timeline
// ---------------------------------------------------------------------------------------------
async function captureRun(browser, game, run, url, gameDir, options = {}) {
  const record = {
    run: run.name, url, viewport: { width: run.width, height: run.height }, deviceScaleFactor: run.dpr, mobile: run.mobile,
    shots: [], conditions: [], consoleErrors: [], consoleWarningCount: 0, consoleWarningSample: [], pageErrors: [], failedRequests: []
  };
  const context = await browser.newContext({
    viewport: { width: run.width, height: run.height },
    deviceScaleFactor: run.dpr,
    isMobile: run.mobile,
    hasTouch: run.mobile,
    ...(run.mobile ? { userAgent: MOBILE_UA } : {}),
    ignoreHTTPSErrors: false,
    serviceWorkers: "block"
  });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error") {
      if (record.consoleErrors.length < 200) record.consoleErrors.push({ text: msg.text().slice(0, 500), url: msg.location()?.url?.slice(0, 200) });
    } else if (type === "warning") {
      record.consoleWarningCount++;
      if (record.consoleWarningSample.length < 10) record.consoleWarningSample.push(msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => { if (record.pageErrors.length < 100) record.pageErrors.push(String(err?.stack ?? err?.message ?? err).slice(0, 800)); });
  page.on("requestfailed", (req) => {
    if (record.failedRequests.length < 200) record.failedRequests.push({ url: req.url().slice(0, 300), type: req.resourceType(), failure: req.failure()?.errorText ?? "" });
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && record.failedRequests.length < 200) {
      record.failedRequests.push({ url: res.url().slice(0, 300), type: res.request().resourceType(), status: res.status() });
    }
  });
  page.on("crash", () => record.pageErrors.push("PAGE CRASHED"));

  const watchdog = setTimeout(() => { record.timedOut = true; context.close().catch(() => undefined); }, options.runTimeoutMs ?? runTimeoutMs);
  try {
    const navStarted = Date.now();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    record.httpStatus = response?.status() ?? null;
    record.gotoMs = Date.now() - navStarted;

    // Readiness: canvas present AND (first instrumented draw / engine drawCalls > 0 / route readyExpr),
    // falling back to a fixed delay after the canvas appears when no signal is available.
    const readyTimeout = game.readyTimeoutMs ?? defaults.readyTimeoutMs ?? 30_000;
    const fallbackMs = defaults.readyFallbackMs ?? 6_000;
    let canvasAt = null; let reason = "timeout"; let last = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < readyTimeout + 15_000) {
      last = await page.evaluate(pageReadiness).catch(() => null);
      if (last && game.readyExpr) last.custom = Boolean(await evaluateExpression(page, game.readyExpr));
      if (last && last.canvasCount > 0 && canvasAt === null) canvasAt = Date.now();
      if (last && last.canvasCount > 0) {
        const drew = (last.liveDrawCalls ?? 0) > 0 || last.firstDrawAt !== null || last.firstGpuSubmitAt !== null;
        const customOk = game.readyExpr ? last.custom === true : true;
        if (drew && customOk) { reason = game.readyExpr ? "draw+readyExpr" : "draw"; break; }
        const hasSignal = last.liveApps > 0 || game.readyExpr;
        if (!hasSignal && Date.now() - canvasAt >= fallbackMs) { reason = "fallback-no-signal"; break; }
        if (Date.now() - canvasAt >= readyTimeout) { reason = drew ? "draw-readyExpr-timeout" : "no-draw-timeout"; break; }
      }
      await sleep(100);
    }
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { responseEndMs: Math.round(n.responseEnd), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadEventMs: Math.round(n.loadEventEnd), transferKB: Math.round((n.transferSize ?? 0) / 1024) } : null;
    }).catch(() => null);
    const resources = await page.evaluate(() => {
      const r = performance.getEntriesByType("resource");
      return { count: r.length, transferKB: Math.round(r.reduce((s, e) => s + (e.transferSize ?? 0), 0) / 1024) };
    }).catch(() => null);
    record.timing = {
      readiness: reason,
      canvasAfterGotoMs: canvasAt ? canvasAt - navStarted : null,
      firstWebglContextMs: last?.firstContextAt != null ? Math.round(last.firstContextAt) : null,
      firstDrawCallMs: last?.firstDrawAt != null ? Math.round(last.firstDrawAt) : null,
      firstWebgpuSubmitMs: last?.firstGpuSubmitAt != null ? Math.round(last.firstGpuSubmitAt) : null,
      readyAtMs: last ? Math.round(last.now) : null,
      navigation: nav,
      resourcesAtReady: resources,
      note: "*Ms values except canvasAfterGotoMs are performance.now() relative to navigation start"
    };

    if (game.focus?.selector) {
      const loc = page.locator(game.focus.selector).first();
      if (game.focus.method === "click") await loc.click({ timeout: 5_000 }).catch(() => undefined);
      else await loc.focus({ timeout: 5_000 }).catch(() => undefined);
    }
    await sleep(game.titleSettleMs ?? defaults.titleSettleMs ?? 1200);
    const timeline = new Timeline(page, run, game, gameDir, record, options.stopAfterShot ?? null);
    await timeline.shot("01-title");
    const snapshot = await page.evaluate(pageSnapshot, game.evidenceGlobal ?? null).catch(() => null);
    record.gl = { probe: snapshot?.probeGl ?? null, app: snapshot?.appGl ?? null, webgpuAvailable: snapshot?.webgpuAvailable ?? null, contexts: snapshot?.contexts ?? [] };
    record.canvas = snapshot?.canvas ?? null;
    record.dpr = snapshot?.dpr ?? null;
    record.engineAtTitle = snapshot?.engine ?? null;

    await timeline.play(game.timeline);
    // Let a still-running FPS sample finish (it starts with the timeline's first step).
    for (let i = 0; i < 70; i++) {
      const f = await page.evaluate(pageReadFps).catch(() => null);
      if (!f || f.done) break;
      await sleep(100);
    }
    record.fps = await page.evaluate(pageReadFps).catch(() => null);
    record.engineAtEnd = (await page.evaluate(pageSnapshot, game.evidenceGlobal ?? null).catch(() => null))?.engine ?? null;
  } catch (e) {
    record.error = String(e?.message ?? e).slice(0, 600);
  } finally {
    clearTimeout(watchdog);
    await context.close().catch(() => undefined);
  }
  const shotNames = record.shots.filter((s) => !s.error).map((s) => s.name);
  const required = options.stopAfterShot ? ["01-title"] : ["01-title", ...(defaults.requiredShots ?? [])];
  record.missingShots = required.filter((n) => !shotNames.includes(n));
  record.blankShots = record.shots.filter((s) => s.pixels?.likelyBlank).map((s) => s.name);
  return record;
}

// ---------------------------------------------------------------------------------------------
// Contact sheets + index
// ---------------------------------------------------------------------------------------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function contactSheetHtml(gameResult, imageSrc) {
  const rows = gameResult.runs.map((run) => {
    const cells = run.shots.filter((s) => !s.error).map((s) => {
      const mobile = run.mobile;
      return `<figure class="${mobile ? "m" : "d"}"><img src="${esc(imageSrc(s))}" alt="${esc(`${run.run} ${s.name}`)}"><figcaption><b>${esc(s.name)}</b> t=${(s.tMs / 1000).toFixed(1)}s · L${s.pixels?.meanLuma ?? "?"} σ${s.pixels?.lumaStd ?? "?"}${s.pixels?.likelyBlank ? " · <i>BLANK?</i>" : ""}</figcaption></figure>`;
    }).join("");
    const gl = run.gl?.app?.unmaskedRenderer ?? run.gl?.probe?.unmaskedRenderer ?? "?";
    const backend = run.engineAtTitle?.[0]?.backend ?? "?";
    return `<section><h2>${esc(run.run)} <small>${esc(run.url)}</small></h2>
<p class="meta">fps ${run.fps?.fps ?? "?"} (p95 ${run.fps?.frameMsP95 ?? "?"}ms, >33ms: ${run.fps?.framesOver33ms ?? "?"}) · first draw ${run.timing?.firstDrawCallMs ?? "?"}ms · ready ${run.timing?.readiness ?? "?"} · canvas ${run.canvas ? `${run.canvas.w}x${run.canvas.h}` : "?"} @dpr ${run.dpr ?? "?"} · backend ${esc(backend)} · GL ${esc(gl)}<br>
console errors ${run.consoleErrors.length} · page errors ${run.pageErrors.length} · failed requests ${run.failedRequests.length}${run.error ? ` · <b>ERROR ${esc(run.error)}</b>` : ""}${run.missingShots?.length ? ` · missing ${esc(run.missingShots.join(", "))}` : ""}</p>
<div class="row">${cells}</div></section>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(gameResult.title)} contact sheet</title><style>
body{margin:0;padding:16px;background:#111;color:#ddd;font:12px/1.35 -apple-system,Helvetica,Arial,sans-serif;width:2400px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:14px 0 2px}h2 small{color:#888;font-weight:normal}
.meta{color:#aaa;margin:0 0 6px}.row{display:flex;flex-wrap:wrap;gap:8px}
figure{margin:0;background:#000}figure.d img{width:384px;display:block}figure.m img{width:150px;display:block}
figcaption{padding:3px 4px;color:#ccc;max-width:384px}figure.m figcaption{max-width:150px}i{color:#f66}
</style></head><body><h1>${esc(gameResult.title)} <small>(${esc(gameResult.id)} · ${esc(gameResult.source)})</small></h1>
<p class="meta">${esc(gameResult.notes ?? "")}</p>${rows}</body></html>`;
}

async function writeContactSheet(browser, gameResult, gameDir) {
  writeFileSync(path.join(gameDir, "contact-sheet.html"), contactSheetHtml(gameResult, (s) => path.basename(s.file)), "utf8");
  const context = await browser.newContext({ viewport: { width: 2432, height: 1200 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const html = contactSheetHtml(gameResult, (s) => {
      try { return `data:image/png;base64,${readFileSync(path.join(outDir, s.file)).toString("base64")}`; } catch { return ""; }
    });
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.screenshot({ path: path.join(gameDir, "contact-sheet.png"), fullPage: true, type: "png", timeout: 120_000 });
    return path.relative(outDir, path.join(gameDir, "contact-sheet.png"));
  } catch (e) {
    log(`contact sheet failed for ${gameResult.id}: ${String(e).slice(0, 160)}`);
    return null;
  } finally {
    await context.close().catch(() => undefined);
  }
}

function writeIndex(report) {
  const rows = report.games.map((g) => {
    const d = g.runs.find((r) => r.run === "desktop-1920x1080") ?? g.runs[0];
    return `<tr><td><a href="${esc(g.id)}/contact-sheet.html">${esc(g.title)}</a></td><td>${esc(g.source)}</td><td>${d?.fps?.fps ?? "?"}</td><td>${d?.timing?.firstDrawCallMs ?? "?"}</td><td>${g.runs.reduce((s, r) => s + r.consoleErrors.length, 0)}</td><td>${g.runs.reduce((s, r) => s + r.pageErrors.length, 0)}</td><td>${g.runs.reduce((s, r) => s + r.failedRequests.length, 0)}</td><td>${esc(g.runs.flatMap((r) => r.missingShots ?? []).length)}</td><td>${esc(g.error ?? "")}</td></tr>`;
  }).join("\n");
  writeFileSync(path.join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Aura3D quality-rebuild captures</title>
<style>body{font:13px -apple-system,Helvetica,Arial,sans-serif;background:#111;color:#ddd;padding:16px}td,th{border:1px solid #333;padding:4px 8px}a{color:#8cf}table{border-collapse:collapse}</style>
<h1>Aura3D quality-rebuild captures</h1><p>${esc(report.generatedAt)} · ${esc(report.environment.browserVersion)} · GL ${esc(report.environment.probeRenderer ?? "?")}</p>
<table><tr><th>game</th><th>source</th><th>fps 1080p</th><th>first draw ms</th><th>console err</th><th>page err</th><th>failed req</th><th>missing shots</th><th>error</th></tr>${rows}</table>`, "utf8");
}

function writeStepSummary(report) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = [
    `### Aura3D game captures`,
    ``,
    `Browser: ${report.environment.browserVersion} · GL: ${report.environment.probeRenderer ?? "?"}`,
    ``,
    `| game | source | fps 1080p | p95 ms | first draw ms | console err | page err | failed req | missing/blank shots |`,
    `|---|---|---|---|---|---|---|---|---|`
  ];
  for (const g of report.games) {
    const d = g.runs.find((r) => r.run === "desktop-1920x1080") ?? g.runs[0];
    const missing = g.runs.flatMap((r) => (r.missingShots ?? []).map((s) => `${r.run}:${s}`));
    const blank = g.runs.flatMap((r) => (r.blankShots ?? []).map((s) => `${r.run}:${s} blank`));
    lines.push(`| ${g.title} | ${g.source} | ${d?.fps?.fps ?? "?"} | ${d?.fps?.frameMsP95 ?? "?"} | ${d?.timing?.firstDrawCallMs ?? "?"} | ${g.runs.reduce((s, r) => s + r.consoleErrors.length, 0)} | ${g.runs.reduce((s, r) => s + r.pageErrors.length, 0)} | ${g.runs.reduce((s, r) => s + r.failedRequests.length, 0)} | ${[...missing, ...blank].join(", ") || "-"} |`);
  }
  try { appendFileSync(file, `${lines.join("\n")}\n`); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  const toBuild = selectedGames.filter(isLocal);
  const builds = {};
  if (!skipBuild && toBuild.length) {
    if (!existsSync(viteBin)) throw new Error(`vite not installed at ${viteBin}; run pnpm install --frozen-lockfile`);
    for (const game of toBuild) builds[game.id] = buildGame(game);
    mkdirSync(buildRoot, { recursive: true });
    writeFileSync(path.join(buildRoot, "build-report.json"), JSON.stringify(builds, null, 2));
  } else if (existsSync(path.join(buildRoot, "build-report.json"))) {
    Object.assign(builds, JSON.parse(readFileSync(path.join(buildRoot, "build-report.json"), "utf8")));
  }
  if (buildOnly) {
    const failed = Object.values(builds).filter((b) => !b.ok);
    log(`build-only: ${Object.keys(builds).length} built, ${failed.length} failed`);
    process.exit(failed.length ? 1 : 0);
  }

  const { chromium } = await import("@playwright/test");
  mkdirSync(outDir, { recursive: true });
  const local = toBuild.length ? await startStaticServer() : null;
  if (local) log(`static server ${local.origin} serving ${path.relative(repoRoot, path.join(buildRoot, "site"))}`);

  const launchOptions = {
    headless: !flag("--headed"),
    args: [...gpuArgs, "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
    ...(executablePath ? { executablePath } : channel ? { channel } : {})
  };
  const environment = {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus()[0]?.model ?? null, cpuCount: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1073741824), node: process.version, launch: { ...launchOptions },
    runner: process.env.RUNNER_NAME ?? null, githubRun: process.env.GITHUB_RUN_ID ?? null, sha: process.env.GITHUB_SHA ?? gitSha()
  };

  const report = {
    schema: "aura3d.quality-rebuild-capture.report/1",
    generatedAt: new Date().toISOString(),
    productionOrigin,
    mode: localBuildAll ? "local-build-all" : "production+local-undeployed",
    environment,
    builds,
    games: []
  };

  for (const game of selectedGames) {
    const gameDir = path.join(outDir, game.id);
    rmSync(gameDir, { recursive: true, force: true });
    mkdirSync(gameDir, { recursive: true });
    const localGame = isLocal(game);
    const origin = localGame ? local?.origin : productionOrigin;
    const result = { id: game.id, title: game.title, genre: game.genre, source: localGame ? "local-build" : "production", notes: game.notes, runs: [] };
    report.games.push(result);
    if (localGame && builds[game.id] && !builds[game.id].ok) {
      result.error = `local build failed: ${builds[game.id].logTail?.split("\n").slice(-3).join(" | ") ?? "see build-report.json"}`;
      log(`skip ${game.id}: ${result.error}`);
      continue;
    }
    log(`game ${game.id} (${result.source}) ${origin}${game.route}`);
    let browser;
    const gameStarted = Date.now();
    try {
      browser = await chromium.launch(launchOptions);
      environment.browserVersion ??= browser.version();
      const runs = [...desktopViewports];
      if (includeMobile) runs.push(MOBILE_RUN);
      for (const run of runs) {
        if (Date.now() - gameStarted > gameTimeoutMs) { result.error = "game timeout"; break; }
        const record = await captureRun(browser, game, run, `${origin}${game.route}`, gameDir, run.mobile ? { stopAfterShot: defaults.mobileStopAfterShot ?? "03-mid" } : {});
        result.runs.push(record);
        environment.probeRenderer ??= record.gl?.probe?.unmaskedRenderer ?? record.gl?.probe?.renderer ?? null;
        log(`  ${run.name}: shots=${record.shots.length} fps=${record.fps?.fps ?? "?"} firstDraw=${record.timing?.firstDrawCallMs ?? "?"}ms ready=${record.timing?.readiness ?? "?"} err=${record.consoleErrors.length}/${record.pageErrors.length} net=${record.failedRequests.length}${record.error ? ` ERROR ${record.error.slice(0, 120)}` : ""}`);
      }
      if (includeAlt && !localGame) {
        for (const [index, altRoute] of (game.altRoutes ?? []).entries()) {
          const altRun = { ...desktopViewports[0], name: `alt${index + 1}-${desktopViewports[0].width}x${desktopViewports[0].height}` };
          const record = await captureRun(browser, game, altRun, `${origin}${altRoute}`, gameDir);
          result.runs.push(record);
          log(`  ${altRun.name} ${altRoute}: shots=${record.shots.length} fps=${record.fps?.fps ?? "?"}`);
        }
      }
      result.contactSheet = await writeContactSheet(browser, result, gameDir);
    } catch (e) {
      result.error = String(e?.message ?? e).slice(0, 600);
      log(`  FAILED ${game.id}: ${result.error}`);
    } finally {
      await browser?.close().catch(() => undefined);
    }
    result.seconds = Math.round((Date.now() - gameStarted) / 1000);
    // Write incrementally so a cancelled job still leaves a usable report.
    writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  }

  report.finishedAt = new Date().toISOString();
  report.summary = report.games.map((g) => ({
    id: g.id, source: g.source, error: g.error ?? null,
    runs: g.runs.map((r) => ({ run: r.run, fps: r.fps?.fps ?? null, firstDrawCallMs: r.timing?.firstDrawCallMs ?? null, readiness: r.timing?.readiness ?? null,
      consoleErrors: r.consoleErrors.length, pageErrors: r.pageErrors.length, failedRequests: r.failedRequests.length,
      missingShots: r.missingShots, blankShots: r.blankShots, error: r.error ?? null }))
  }));
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeIndex(report);
  writeStepSummary(report);
  local?.server.close();
  const failures = report.games.filter((g) => g.error || g.runs.some((r) => r.error || r.missingShots?.length));
  log(`done: ${report.games.length} games, ${failures.length} with errors/missing shots -> ${path.relative(repoRoot, outDir)}/report.json`);
  if (strict && failures.length) process.exit(1);
}

function gitSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
