import { chromium } from "@playwright/test";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { applyFpsCalibrationToMetrics, runFpsCalibration, samplePageFps } from "../../../runner/fps-calibration.mjs";

const [, , sceneDirArg, libraryArg] = process.argv;
if (!sceneDirArg || !libraryArg) {
  console.error("Usage: node capture-engine.mjs <engine-scene-dir> <aura3d|threejs>");
  process.exit(2);
}

const sceneDir = resolve(sceneDirArg);
const sourceDir = join(sceneDir, libraryArg, "source");
const outputDir = join(sceneDir, libraryArg);

function walk(root, pred, acc = []) {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const file = join(root, entry);
    const st = statSync(file);
    if (st.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry)) walk(file, pred, acc);
    } else if (pred(file)) acc.push(file);
  }
  return acc;
}

function loc() {
  let count = 0;
  const files = walk(sourceDir, (file) => /(^index\.html$|\/src\/|\.ts$|\.html$|\.css$)/.test(file.slice(sourceDir.length + 1)));
  for (const file of files) {
    const text = awaitableRead(file);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*")) count += 1;
    }
  }
  return count;
}

function awaitableRead(file) {
  return readFileSync(file, "utf8");
}

function run(command, args, logName) {
  const result = spawnSync(command, args, { cwd: sourceDir, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  writeFileSync(join(outputDir, logName), [`$ ${command} ${args.join(" ")}`, "", result.stdout ?? "", result.stderr ?? ""].join("\n"));
  return result;
}

async function gzipSize(file) {
  return new Promise((resolveSize, reject) => {
    let total = 0;
    const gzip = createGzip({ level: 9 });
    gzip.on("data", (chunk) => { total += chunk.length; });
    gzip.on("end", () => resolveSize(total));
    gzip.on("error", reject);
    createReadStream(file).pipe(gzip);
  });
}

async function bundleSize() {
  let total = 0;
  for (const file of walk(join(sourceDir, "dist"), (f) => f.endsWith(".js"))) {
    total += await gzipSize(file);
  }
  return total;
}

const install = run("npm", ["install"], "install.log");
let buildStatus = 1;
let routeHealth = "fail";
let firstUsableRenderMs = null;
let p50Fps = null;
let p95FrameTimeMs = null;
let fpsInstrumentationStatus = "not-run";
let fpsInstrumentationFailures = [];
let fpsCalibration = null;
let drawCalls = null;
let triangleCount = null;
let jsHeapPeakBytes = null;
let screenshot = null;

if (install.status === 0) {
  const build = run("npm", ["run", "build"], "build.log");
  buildStatus = build.status ?? 1;
  if (buildStatus === 0) {
    const sceneIndex = Number((basename(sceneDir).match(/engine-(\d\d)-/) ?? [0, 0])[1]);
    const port = 7000 + sceneIndex * 10 + (libraryArg === "aura3d" ? 1 : 2);
    const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], { cwd: sourceDir, stdio: ["ignore", "pipe", "pipe"] });
    let runLog = "";
    server.stdout.on("data", (c) => { runLog += c.toString(); });
    server.stderr.on("data", (c) => { runLog += c.toString(); });
    const browser = await chromium.launch();
    try {
      fpsCalibration = await runFpsCalibration(browser, {
        viewport: { width: 1440, height: 960 },
        controlWarmupMs: 500,
        controlSampleMs: 3000
      });
      fpsInstrumentationStatus = fpsCalibration.verdict.status;
      fpsInstrumentationFailures = fpsCalibration.verdict.failures;
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
      const started = Date.now();
      let loaded = false;
      for (let i = 0; i < 80; i += 1) {
        try {
          const res = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 3000 });
          if (res?.ok()) { loaded = true; break; }
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (loaded) {
        firstUsableRenderMs = Date.now() - started;
        const fpsSample = await samplePageFps(page, { warmupMs: 5000, sampleMs: 15000 });
        p50Fps = fpsSample.p50Fps;
        p95FrameTimeMs = fpsSample.p95FrameTimeMs;
        const readout = await page.evaluate(() => window.__ENGINE_READOUT__?.() ?? {});
        routeHealth = readout.routeHealth ?? "pass";
        drawCalls = readout.drawCalls ?? null;
        triangleCount = readout.triangleCount ?? null;
        jsHeapPeakBytes = await page.evaluate(() => performance?.memory?.usedJSHeapSize ?? null).catch(() => null);
        await page.screenshot({ path: join(outputDir, "screenshot.png"), fullPage: false, timeout: 60000 });
        screenshot = "screenshot.png";
      }
    } finally {
      await browser.close();
      server.kill("SIGTERM");
      writeFileSync(join(outputDir, "run.log"), runLog);
    }
  }
}

const metrics = applyFpsCalibrationToMetrics({
  scene: basename(sceneDir),
  library: libraryArg === "aura3d" ? "Aura3D" : "Three.js",
  routeHealth,
  firstUsableRenderMs,
  p50Fps,
  p95FrameTimeMs,
  fpsInstrumentationStatus,
  fpsInstrumentationFailures,
  drawCalls,
  triangleCount,
  jsHeapPeakBytes,
  gpuMemoryBytes: null,
  bundleSizeGzipBytes: buildStatus === 0 ? await bundleSize() : null,
  sourceLoc: loc(),
  screenshot
}, fpsCalibration ?? {
  verdict: {
    status: "invalid",
    failures: ["FPS calibration did not run."],
    thresholds: null
  }
});
writeFileSync(join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
if (buildStatus !== 0 || routeHealth !== "pass" || !screenshot) process.exit(1);
