#!/usr/bin/env node
/*
 * tools/agent-templates/capture-templates.mjs — T0.1 template look-dev capture.
 *
 * Builds every packages/create-aura3d/templates/<id> from packed release tarballs
 * (`node tools/release/publish-all.mjs --pack-only`, read-only use), serves each
 * dist/ with `vite preview`, and captures opening/mid/action screenshots at
 * 1920x1080 (DPR 1) and 390x844 (DPR 3) with Playwright. C-33 conventions:
 *  - readiness: `window.__AURA3D_GAME__?.state === "playing"` when the beacon is
 *    present, else the existing probe (canvas + first instrumented draw /
 *    engine drawCalls > 0), else a 6 s fallback after the canvas appears.
 *  - feature flags ride the `a3d-qr=<list>` URL param; `?capture=` keys are
 *    never used.
 *  - report.json records template, shot, viewport, sha256, flags and the run id
 *    plus ciProvider/browserChannel, so frames from different providers and
 *    channels are never compared.
 *
 * Runs only inside .github/workflows/template-lookdev.yml on macos-14 — never
 * locally (PRD-13 §17).
 *
 *   node tools/agent-templates/capture-templates.mjs
 *   node tools/agent-templates/capture-templates.mjs --templates mini-game,product-viewer
 *   node tools/agent-templates/capture-templates.mjs --skip-pack
 *   node tools/agent-templates/capture-templates.mjs --flags a3d_qr_looks
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "..", "..");
const templateRoot = path.join(repoRoot, "packages", "create-aura3d", "templates");
const packDir = path.join(repoRoot, "tests", "reports", "release-tarballs");

// -------------------------------------------------------------------------
// CLI / environment (same conventions as tools/quality-rebuild-capture)
// -------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, envName, fallback) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const envValue = envName ? process.env[envName] : undefined;
  return envValue !== undefined && envValue !== "" ? envValue : fallback;
};
const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const log = (m) => console.log(`[capture-templates] ${m}`);

const outDir = path.resolve(repoRoot, opt("--out", "QRC_OUT", "tools/agent-templates/out/template-lookdev"));
const skipPack = flag("--skip-pack") || truthy(process.env.QRC_SKIP_PACK);
const skipBuild = flag("--skip-build") || truthy(process.env.QRC_SKIP_BUILD);
const channelOpt = opt("--channel", "QRC_CHANNEL", "chromium");
const channel = channelOpt === "headless-shell" ? "" : channelOpt;
const executablePath = opt("--executable", "QRC_EXECUTABLE", "");
const gpuArgs = opt("--gpu-args", "QRC_GPU_ARGS", "--use-angle=metal --enable-gpu --ignore-gpu-blocklist").split(/\s+/).filter(Boolean);
const installTimeoutMs = Number(opt("--install-timeout", "QRC_INSTALL_TIMEOUT_MS", "600000"));
const buildTimeoutMs = Number(opt("--build-timeout", "QRC_BUILD_TIMEOUT_MS", "600000"));
const readyTimeoutMs = Number(opt("--ready-timeout", "QRC_READY_TIMEOUT_MS", "30000"));
const readyFallbackMs = Number(opt("--ready-fallback", "QRC_READY_FALLBACK_MS", "6000"));
const previewPort = Number(opt("--port", "QRC_PREVIEW_PORT", "4173"));

const qrFlags = opt("--flags", "QRC_FLAGS", "none");
if (qrFlags !== "none" && qrFlags !== "all" && !/^[A-Za-z0-9_,.-]+$/.test(qrFlags)) {
  console.error(`--flags must be "none", "all", or a comma list of flag ids; got "${qrFlags}"`);
  process.exit(2);
}
const urlFlags = qrFlags === "none" ? [] : qrFlags.split(",");

const VIEWPORTS = [
  { name: "desktop-1920x1080", width: 1920, height: 1080, dpr: 1, mobile: false },
  { name: "mobile-390x844", width: 390, height: 844, dpr: 3, mobile: true }
];
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const SHOTS = ["opening", "mid", "action"];
const SHOT_SETTLE_MS = { opening: 0, mid: 2000, action: 800 };

const templateIds = readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(templateRoot, entry.name, "package.json")))
  .map((entry) => entry.name)
  .sort();
const requested = opt("--templates", "QRC_TEMPLATES", "").split(",").map((s) => s.trim()).filter(Boolean);
for (const id of requested) {
  if (!templateIds.includes(id)) {
    console.error(`unknown template "${id}". Known: ${templateIds.join(", ")}`);
    process.exit(2);
  }
}
const selected = requested.length ? templateIds.filter((id) => requested.includes(id)) : templateIds;
if (flag("--list")) {
  console.log(selected.join("\n"));
  process.exit(0);
}
if (!selected.length) {
  console.error("no templates selected");
  process.exit(2);
}

// -------------------------------------------------------------------------
// Packed tarballs -> install set
// -------------------------------------------------------------------------
function packTarballs() {
  if (skipPack) {
    log("--skip-pack: reusing tests/reports/release-tarballs");
  } else {
    log("packing release tarballs (tools/release/publish-all.mjs --pack-only)");
    execFileSync(process.execPath, [path.join(repoRoot, "tools", "release", "publish-all.mjs"), "--pack-only"], { cwd: repoRoot, stdio: "inherit" });
  }
  if (!existsSync(packDir)) {
    throw new Error(`no packed tarballs at ${path.relative(repoRoot, packDir)} — run without --skip-pack first`);
  }
  const planPath = path.join(packDir, "release-plan.json");
  const byName = new Map();
  if (existsSync(planPath)) {
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    for (const entry of plan.packages ?? []) {
      byName.set(entry.name, { name: entry.name, version: entry.version ?? null, tarball: path.resolve(repoRoot, entry.tarball), sha256: entry.sha256 ?? null });
    }
  }
  for (const file of readdirSync(packDir).filter((f) => f.endsWith(".tgz"))) {
    const tarball = path.join(packDir, file);
    const name = Object.keys(byName).length ? null : file.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "").replace(/^aura3d-/, "@aura3d/");
    if (name && !byName.has(name)) byName.set(name, { name, version: null, tarball, sha256: sha256(readFileSync(tarball)) });
  }
  for (const entry of byName.values()) {
    if (!existsSync(entry.tarball)) throw new Error(`packed tarball missing: ${entry.tarball}`);
    entry.sha256 ??= sha256(readFileSync(entry.tarball));
  }
  return byName;
}

// Transitive @aura3d/* dependency closure of a scaffold, like the installed-
// tarball smoke in tools/agent-templates/index.ts: every aura dependency in
// the tree must resolve to the packed tarball, never the registry.
function auraClosure(templateDeps, packedByName) {
  const manifests = new Map();
  const roots = [repoRoot, ...readdirSync(path.join(repoRoot, "packages")).map((d) => path.join(repoRoot, "packages", d))];
  for (const dir of roots) {
    const pkgPath = path.join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const manifest = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (manifest.name?.startsWith("@aura3d/")) manifests.set(manifest.name, manifest);
  }
  const closure = new Set();
  const visit = (name) => {
    if (closure.has(name)) return;
    closure.add(name);
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`No workspace manifest found for template dependency ${name}`);
    for (const dep of Object.keys(manifest.dependencies ?? {}).filter((d) => d.startsWith("@aura3d/"))) visit(dep);
  };
  for (const name of templateDeps) visit(name);
  return [...closure].sort().map((name) => {
    const packed = packedByName.get(name);
    if (!packed) throw new Error(`No packed tarball for ${name}`);
    return packed;
  });
}

function runStep(command, args, cwd, label, timeoutMs) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, CI: "1" } });
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.split("\n").slice(-25).join("\n");
    throw new Error(`${label} failed (${command} ${args.join(" ")}):\n${tail}`);
  }
  return result;
}

function scaffoldTemplate(id) {
  const source = path.join(templateRoot, id);
  const dir = path.join(outDir, "work", id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(source, dir, {
    recursive: true,
    filter: (src) => !path.relative(source, src).split(/[\\/]/).some((part) => part === "node_modules" || part === "dist" || part === "test-results")
  });
  return dir;
}
// -------------------------------------------------------------------------
// In-page instrumentation (identical to tools/quality-rebuild-capture)
// -------------------------------------------------------------------------
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

/** Evaluated in page: readiness signals (C-33 probe + __AURA3D_GAME__ beacon). */
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
  let gameState = null;
  try { gameState = globalThis.__AURA3D_GAME__?.state ?? null; } catch { /* ignore */ }
  const q = window.__QRC__ ?? {};
  return {
    now: performance.now(),
    canvasCount: canvases.length,
    liveApps,
    liveDrawCalls,
    gameState,
    firstDrawAt: q.firstDrawAt ?? null,
    firstGpuSubmitAt: q.firstGpuSubmitAt ?? null,
    firstContextAt: q.firstContextAt ?? null
  };
}

function captureUrl(origin) {
  if (!urlFlags.length) return `${origin}/`;
  return `${origin}/?a3d-qr=${encodeURIComponent(urlFlags.join(","))}`;
}

// `vite preview` on a fixed port, sequential per template.
async function startPreview(scaffoldDir) {
  const viteBin = path.join(scaffoldDir, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error("vite not installed in scaffold");
  const child = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"], { cwd: scaffoldDir, stdio: ["ignore", "pipe", "pipe"] });
  const origin = `http://127.0.0.1:${previewPort}`;
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited with ${child.exitCode}`);
    try {
      const res = await fetch(origin, { signal: AbortSignal.timeout(2_000) });
      if (res.status < 500) return { child, origin };
    } catch (error) { lastError = error; }
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`vite preview did not come up on ${origin}: ${lastError?.message ?? "timeout"}`);
}

async function captureViewport(browser, templateId, run, origin, shotsDir) {
  const record = {
    viewport: { name: run.name, width: run.width, height: run.height, dpr: run.dpr, mobile: run.mobile },
    shots: [], consoleErrorCount: 0, consoleErrorSample: [], pageErrors: [], failedRequestCount: 0
  };
  const context = await browser.newContext({
    viewport: { width: run.width, height: run.height },
    deviceScaleFactor: run.dpr,
    isMobile: run.mobile,
    hasTouch: run.mobile,
    ...(run.mobile ? { userAgent: MOBILE_UA } : {}),
    serviceWorkers: "block"
  });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      record.consoleErrorCount++;
      if (record.consoleErrorSample.length < 10) record.consoleErrorSample.push(msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => { if (record.pageErrors.length < 50) record.pageErrors.push(String(err?.stack ?? err?.message ?? err).slice(0, 600)); });
  page.on("requestfailed", () => record.failedRequestCount++);
  const url = captureUrl(origin);
  try {
    const navStarted = Date.now();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    record.httpStatus = response?.status() ?? null;
    record.url = url;

    // C-33 readiness: game beacon first, then the instrumented-draw probe, then
    // the fixed fallback once a canvas exists.
    let canvasAt = null;
    let reason = "timeout";
    let last = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < readyTimeoutMs + 15_000) {
      last = await page.evaluate(pageReadiness).catch(() => null);
      if (last?.gameState === "playing") { reason = "game-playing"; break; }
      if (last && last.canvasCount > 0 && canvasAt === null) canvasAt = Date.now();
      if (last && last.canvasCount > 0) {
        const drew = (last.liveDrawCalls ?? 0) > 0 || last.firstDrawAt !== null || last.firstGpuSubmitAt !== null;
        if (drew) { reason = "draw"; break; }
        if (last.liveApps === 0 && Date.now() - canvasAt >= readyFallbackMs) { reason = "fallback-no-signal"; break; }
        if (Date.now() - canvasAt >= readyTimeoutMs) { reason = drew ? "draw-timeout" : "no-draw-timeout"; break; }
      }
      await sleep(100);
    }
    record.timing = {
      readiness: reason,
      canvasAfterGotoMs: canvasAt ? canvasAt - navStarted : null,
      firstDrawCallMs: last?.firstDrawAt != null ? Math.round(last.firstDrawAt) : null,
      readyAtMs: last ? Math.round(last.now) : null
    };

    // opening (post-readiness) -> mid (+2 s) -> action (input burst + settle)
    for (const shot of SHOTS) {
      if (shot === "action") {
        const box = await page.locator("canvas").first().boundingBox().catch(() => null);
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", buttons: 1, clickCount: 1 }).catch(() => undefined);
          await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + Math.min(80, box.width / 6), y: cy + Math.min(36, box.height / 8), button: "left", buttons: 1 }).catch(() => undefined);
          await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx + Math.min(80, box.width / 6), y: cy + Math.min(36, box.height / 8), button: "left", buttons: 0, clickCount: 1 }).catch(() => undefined);
          await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: cx, y: cy, deltaX: 0, deltaY: -120 }).catch(() => undefined);
          await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).catch(() => undefined);
          await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).catch(() => undefined);
        }
      }
      const settle = SHOT_SETTLE_MS[shot] ?? 0;
      if (settle) await sleep(settle);
      const png = await page.screenshot({ type: "png" });
      const file = path.join(shotsDir, `${shot}-${run.name}.png`);
      writeFileSync(file, png);
      record.shots.push({ shot, viewport: run.name, file: path.relative(outDir, file), bytes: png.length, sha256: sha256(png) });
    }
  } catch (error) {
    record.error = String(error?.message ?? error).slice(0, 500);
  } finally {
    await context.close().catch(() => undefined);
  }
  return record;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main() {
  const packedByName = packTarballs();
  const report = {
    schema: "aura3d.template-lookdev/1",
    generatedAt: new Date().toISOString(),
    environment: {
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      node: process.version,
      runner: process.env.RUNNER_NAME ?? process.env.CI_RUNNER_DESCRIPTION ?? null,
      runId: process.env.GITHUB_RUN_ID ?? process.env.CI_PIPELINE_ID ?? null,
      ciProvider: process.env.GITLAB_CI ? "gitlab" : process.env.GITHUB_ACTIONS ? "github" : "local",
      gitlabPipeline: process.env.CI_PIPELINE_ID ?? null,
      browserChannel: channelOpt,
      sha: process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout?.trim() ?? null
    },
    flags: { requested: qrFlags, urlParam: urlFlags },
    viewports: VIEWPORTS,
    shots: SHOTS,
    templates: [],
    failures: []
  };
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "report.json");
  const progressPath = path.join(outDir, "progress.json");
  const persist = () => {
    writeFileSync(progressPath, JSON.stringify({ updatedAt: new Date().toISOString(), done: report.templates.length, total: selected.length, failures: report.failures }, null, 2));
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  };
  persist();

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    headless: !flag("--headed"),
    args: [...gpuArgs, "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
    ...(executablePath ? { executablePath } : channel ? { channel } : {})
  });
  report.environment.browserVersion = browser.version();
  try {
    for (const id of selected) {
      const entry = { template: id, runs: [], shotsExpected: SHOTS.length * VIEWPORTS.length };
      report.templates.push(entry);
      const shotsDir = path.join(outDir, "shots", id);
      rmSync(shotsDir, { recursive: true, force: true });
      mkdirSync(shotsDir, { recursive: true });
      let preview = null;
      try {
        const scaffoldDir = path.join(outDir, "work", id);
        // --skip-build reuses an existing scaffold+dist so the capture side can
        // be iterated without repacking and rebuilding every template.
        const reusable = skipBuild && existsSync(path.join(scaffoldDir, "dist", "index.html"));
        if (!reusable) {
          scaffoldTemplate(id);
          const pkg = JSON.parse(readFileSync(path.join(scaffoldDir, "package.json"), "utf8"));
          const auraDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@aura3d/"));
          const closure = auraClosure(auraDeps, packedByName);
          entry.tarballs = closure.map((t) => ({ name: t.name, version: t.version, tarball: path.basename(t.tarball), sha256: t.sha256 }));
          runStep("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", ...closure.map((t) => t.tarball)], scaffoldDir, "npm install", installTimeoutMs);
          runStep("npm", ["run", "build"], scaffoldDir, "npm run build", buildTimeoutMs);
        } else {
          entry.reusedBuild = true;
        }
        if (!existsSync(path.join(scaffoldDir, "dist", "index.html"))) throw new Error("build produced no dist/index.html");
        preview = await startPreview(scaffoldDir);
        for (const run of VIEWPORTS) {
          entry.runs.push(await captureViewport(browser, id, run, preview.origin, shotsDir));
        }
        entry.shotsCaptured = entry.runs.reduce((sum, r) => sum + r.shots.length, 0);
        const runErrors = entry.runs.filter((r) => r.error);
        if (entry.shotsCaptured < entry.shotsExpected || runErrors.length) {
          entry.failed = true;
          report.failures.push({ template: id, shotsCaptured: entry.shotsCaptured, shotsExpected: entry.shotsExpected, errors: runErrors.map((r) => `${r.viewport.name}: ${r.error}`) });
        }
      } catch (error) {
        entry.failed = true;
        entry.error = String(error?.message ?? error).slice(0, 800);
        report.failures.push({ template: id, error: entry.error });
      } finally {
        if (preview) preview.child.kill("SIGKILL");
      }
      log(`${id}: shots=${entry.shotsCaptured ?? 0}/${entry.shotsExpected}${entry.failed ? " FAILED" : ""}`);
      persist();
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  const expected = selected.length * SHOTS.length * VIEWPORTS.length;
  const captured = report.templates.reduce((sum, t) => sum + (t.shotsCaptured ?? 0), 0);
  report.summary = { templatesPlanned: selected.length, templatesCaptured: report.templates.filter((t) => !t.failed).length, shotsExpected: expected, shotsCaptured: captured, failures: report.failures.length };
  persist();
  log(`done: ${report.summary.templatesCaptured}/${report.summary.templatesPlanned} templates, ${captured}/${expected} shots`);
  if (report.failures.length) {
    console.error(JSON.stringify(report.failures, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});

