#!/usr/bin/env node
/*
 * capture-examples.mjs — audit capture for the non-game examples (examples.json):
 * create-aura3d templates, root-only starters, and evidence / marketing routes
 * under apps/. Runs inside .github/workflows/qr-azure-gpu.yml (suite=examples)
 * on the L4 runner, never locally.
 *
 *   node tools/quality-rebuild-capture/capture-examples.mjs --build-only
 *   node tools/quality-rebuild-capture/capture-examples.mjs --skip-build
 *   QRC_EXAMPLES=loader-obj,react node tools/quality-rebuild-capture/capture-examples.mjs
 *
 * Templates build through tools/agent-templates/capture-templates.mjs --build-only
 * (packed release tarballs, the create-aura3d scaffold flow); apps build with the
 * same vite wrapper as capture-games.mjs. Each example is captured at 1280x720
 * DPR 1: opening (ready + 3 s), mid (after a 4 s fps window), action (input +1 s).
 * report.json records page errors, console errors, DOM error panels, draw calls
 * per frame and fps; pixel metrics are computed offline from the PNGs.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "..", "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, env, fb) => { const i = argv.indexOf(n); if (i >= 0 && argv[i + 1]) return argv[i + 1]; return process.env[env] || fb; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[capture-examples] ${m}`);

const outDir = path.resolve(repoRoot, opt("--out", "QRC_EXAMPLES_OUT", "tools/quality-rebuild-capture/out/examples"));
const workRoot = path.resolve(repoRoot, "tools/quality-rebuild-capture/.build-examples");
const gpuArgs = (process.env.QRC_GPU_ARGS || "--use-angle=metal --enable-gpu --ignore-gpu-blocklist").split(/\s+/).filter(Boolean);
const registry = JSON.parse(readFileSync(path.join(toolDir, "examples.json"), "utf8")).examples;
const wanted = opt("--examples", "QRC_EXAMPLES", "").split(",").map((s) => s.trim()).filter(Boolean);
for (const id of wanted) if (!registry.some((e) => e.id === id)) { console.error(`unknown example ${id}`); process.exit(2); }
const selected = wanted.length ? registry.filter((e) => wanted.includes(e.id)) : registry;
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

function templateWork(kind) { return path.join(workRoot, kind); }
function distFor(ex) {
  if (ex.kind === "app") return path.join(workRoot, "site", "apps", ex.dir ?? ex.id);
  return path.join(templateWork(ex.kind), "work", ex.id, "dist");
}

function buildTemplates(kind, ids, skipPack) {
  if (!ids.length) return;
  const args = [path.join(repoRoot, "tools/agent-templates/capture-templates.mjs"), "--build-only", "--templates", ids.join(","), "--out", templateWork(kind)];
  if (kind === "root") args.push("--template-root", "templates");
  if (skipPack) args.push("--skip-pack");
  log(`build ${kind} templates: ${ids.join(",")}`);
  const r = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit", timeout: 90 * 60_000 });
  if (r.status !== 0) log(`${kind} template build exited ${r.status} (per-template failures in ${path.relative(repoRoot, templateWork(kind))}/report.json)`);
}

function buildApp(ex) {
  const dir = ex.dir ?? ex.id;
  const appDir = path.join(repoRoot, "apps", dir);
  const appConfig = path.join(appDir, "vite.config.ts");
  const sourceConfig = existsSync(appConfig) ? appConfig : path.join(repoRoot, "vite.config.ts");
  const configDir = path.join(workRoot, "configs");
  mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, `${ex.id}.vite.config.mjs`);
  writeFileSync(configPath, `import sourceConfig from ${JSON.stringify(sourceConfig)};
const resolved = typeof sourceConfig === "function" ? await sourceConfig({ command: "build", mode: "production", isSsrBuild: false, isPreview: false }) : sourceConfig;
const build = resolved.build ?? {};
const rollupOptions = build.rollupOptions ?? {};
export default { ...resolved, root: ${JSON.stringify(appDir)}, base: ${JSON.stringify(`/apps/${dir}/`)}, publicDir: false, logLevel: "warn",
  build: { ...build, outDir: ${JSON.stringify(distFor(ex))}, emptyOutDir: true, sourcemap: false, reportCompressedSize: false,
    rollupOptions: { ...rollupOptions, input: ${JSON.stringify(path.join(appDir, "index.html"))} } } };
`);
  log(`build app ${ex.id}`);
  const r = spawnSync(process.execPath, ["--max-old-space-size=6144", viteBin, "build", "--config", configPath], { cwd: repoRoot, encoding: "utf8", timeout: 20 * 60_000, maxBuffer: 64 << 20 });
  const ok = r.status === 0 && existsSync(path.join(distFor(ex), "index.html"));
  if (!ok) log(`build FAILED ${ex.id}\n${`${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-30).join("\n")}`);
  return ok;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".woff2": "font/woff2", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

function serve(roots, appFallback) {
  const tryFile = (root, rel) => {
    const full = path.resolve(root, `.${rel}`);
    if (!full.startsWith(path.resolve(root))) return null;
    try { const st = statSync(full); if (st.isFile()) return full; if (st.isDirectory() && existsSync(path.join(full, "index.html"))) return path.join(full, "index.html"); } catch { /* missing */ }
    return null;
  };
  const server = createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const appRel = appFallback ? /^\/apps\/[^/]+(\/.*)$/.exec(p)?.[1] : null;
    const file = roots.map((r) => tryFile(r, p) ?? (appRel ? tryFile(r, appRel) : null)).find(Boolean);
    if (!file) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

const INIT_SCRIPT = `(() => {
  if (window.__QRX__) return;
  const q = window.__QRX__ = { draws: 0, firstDrawAt: null, contexts: [] };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = getContext.call(this, type, attrs);
    try { if (ctx && /webgl|webgpu/i.test(String(type)) && q.contexts.length < 8) q.contexts.push(String(type)); } catch {}
    return ctx;
  };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const n of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
      const o = C.prototype[n]; if (typeof o !== "function") continue;
      C.prototype[n] = function (...a) { q.draws++; if (q.firstDrawAt === null) q.firstDrawAt = performance.now(); return o.apply(this, a); };
    }
  }
  if (window.GPUQueue) { const s = GPUQueue.prototype.submit; GPUQueue.prototype.submit = function (...a) { if (q.firstDrawAt === null) q.firstDrawAt = performance.now(); q.draws++; return s.apply(this, a); }; }
})();`;

function probe() {
  let liveApps = 0, engineDrawCalls = null;
  try { for (const app of globalThis.__AURA3D_LIVE_APPS__?.all?.() ?? []) { liveApps++; engineDrawCalls = Math.max(engineDrawCalls ?? 0, Number(app.diagnostics()?.drawCalls ?? 0)); } } catch { /* ignore */ }
  const q = window.__QRX__ ?? {};
  return { canvasCount: document.querySelectorAll("canvas").length, liveApps, engineDrawCalls, draws: q.draws ?? 0, firstDrawAt: q.firstDrawAt ?? null, contexts: q.contexts ?? [] };
}

function domErrorPanels() {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (out.length >= 5) break;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 18 || r.bottom < 0 || r.top > innerHeight) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(cs.backgroundColor);
    const red = m && +m[1] > 140 && +m[2] < 90 && +m[3] < 90 && (m[4] === undefined || +m[4] > 0.3);
    const txt = (el.innerText || "").trim().slice(0, 200);
    if (!txt) continue;
    const errText = /\b(error|failed|exception|uncaught|unavailable|not supported)\b/i.test(txt) && el.children.length < 4 && txt.length < 400;
    if (red || (errText && (el.getAttribute("role") === "alert" || /error|fail|warn/i.test(`${el.className} ${el.id}`)))) out.push(txt.slice(0, 160));
  }
  return out;
}

function fpsWindow(ms) {
  return new Promise((resolve) => {
    const q = window.__QRX__ ?? { draws: 0 };
    const d0 = q.draws; let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; const dt = performance.now() - t0; if (dt < ms) requestAnimationFrame(tick); else resolve({ fps: (frames * 1000) / dt, frames, drawsPerFrame: (q.draws - d0) / Math.max(1, frames) }); };
    requestAnimationFrame(tick);
  });
}

async function captureOne(browser, ex, url, shotsDir) {
  const rec = { id: ex.id, kind: ex.kind, url, shots: [], pageErrors: [], consoleErrors: [], failedRequests: [] };
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && rec.consoleErrors.length < 12) rec.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => { if (rec.pageErrors.length < 20) rec.pageErrors.push(String(e?.stack ?? e).slice(0, 500)); });
  page.on("requestfailed", (r) => { if (rec.failedRequests.length < 12) rec.failedRequests.push(r.url().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400 && rec.failedRequests.length < 12) rec.failedRequests.push(`${r.status()} ${r.url().slice(0, 200)}`); });
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    rec.httpStatus = resp?.status() ?? null;
    const t0 = Date.now(); let last = null; rec.readiness = "timeout";
    while (Date.now() - t0 < 45_000) {
      last = await page.evaluate(probe).catch(() => null);
      if (last && last.canvasCount > 0 && (last.firstDrawAt !== null || (last.engineDrawCalls ?? 0) > 0)) { rec.readiness = "draw"; break; }
      await sleep(150);
    }
    rec.readyMs = Date.now() - t0;
    const shoot = async (name) => {
      const file = path.join(shotsDir, `${name}.png`);
      writeFileSync(file, await page.screenshot({ type: "png" }));
      rec.shots.push({ shot: name, file: path.relative(outDir, file), atMs: Date.now() - t0 });
    };
    await sleep(3000);
    await shoot("opening");
    rec.perf = await page.evaluate(fpsWindow, 4000).catch((e) => ({ error: String(e) }));
    await shoot("mid");
    const box = await page.locator("canvas").first().boundingBox().catch(() => null);
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 90, cy + 30, { steps: 6 }); await page.mouse.up();
    }
    await sleep(1000);
    await shoot("action");
    rec.probe = await page.evaluate(probe).catch(() => null);
    rec.domErrorPanels = await page.evaluate(domErrorPanels).catch(() => []);
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 500);
  } finally {
    await context.close().catch(() => undefined);
  }
  return rec;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (!flag("--skip-build")) {
    const ids = (k) => selected.filter((e) => e.kind === k).map((e) => e.id);
    buildTemplates("packaged", ids("packaged"), false);
    buildTemplates("root", ids("root"), ids("packaged").length > 0);
    for (const ex of selected.filter((e) => e.kind === "app")) buildApp(ex);
    if (flag("--build-only")) return;
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, args: [...gpuArgs, "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  const report = { schema: "aura3d.examples-audit/1", generatedAt: new Date().toISOString(), sha: process.env.GITHUB_SHA ?? null,
    examplesRef: process.env.QRC_EXAMPLES_REF || null, runner: process.env.RUNNER_NAME ?? null, browser: browser.version(), examples: [] };
  const persist = () => writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const appRoots = [path.join(workRoot, "site"), path.join(repoRoot, "public"), path.join(repoRoot, "marketing", "public")];
  try {
    for (const ex of selected) {
      const dist = distFor(ex);
      if (!existsSync(path.join(dist, "index.html"))) { report.examples.push({ id: ex.id, kind: ex.kind, error: "build produced no dist/index.html" }); persist(); continue; }
      const roots = ex.kind === "app" ? [...appRoots, path.join(repoRoot, "apps", ex.dir ?? ex.id, "public")] : [dist];
      const srv = await serve(roots, ex.kind === "app");
      const shotsDir = path.join(outDir, "shots", ex.id);
      mkdirSync(shotsDir, { recursive: true });
      const url = ex.kind === "app" ? `${srv.origin}/apps/${ex.dir ?? ex.id}/` : `${srv.origin}/`;
      const rec = await captureOne(browser, ex, url, shotsDir);
      srv.server.close();
      report.examples.push(rec);
      log(`${ex.id}: shots=${rec.shots.length} fps=${rec.perf?.fps?.toFixed?.(1) ?? "?"} draws/frame=${rec.perf?.drawsPerFrame?.toFixed?.(1) ?? "?"} pageErrors=${rec.pageErrors.length} panels=${rec.domErrorPanels?.length ?? 0}${rec.error ? ` ERROR ${rec.error}` : ""}`);
      persist();
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  persist();
}

main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
