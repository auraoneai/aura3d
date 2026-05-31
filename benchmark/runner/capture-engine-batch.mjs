import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const roundId = parseRoundId(process.argv.slice(2));
const roundRoot = resolve(repoRoot, "benchmark/runs", roundId);
const engineRoot = join(roundRoot, "engine");
const allowResume = process.env.AURA3D_ALLOW_ENGINE_RESUME === "1";
const scenes = [
  "engine-01-material-grid",
  "engine-02-city-block",
  "engine-03-particles-vfx",
  "engine-04-physics-ramp",
  "engine-05-sneaker-product"
];

function parseRoundId(args) {
  const roundArg = args.find((arg) => arg.startsWith("--round="))?.slice("--round=".length) ?? args[0];
  if (!roundArg || !/^round-[a-zA-Z0-9._-]+$/.test(roundArg)) {
    console.error("Usage: node benchmark/runner/capture-engine-batch.mjs --round=round-N");
    process.exit(2);
  }
  return roundArg;
}

function hasCompleteCapture(scene, library) {
  const metricsFile = join(engineRoot, scene, library, "metrics.json");
  const routeFile = join(engineRoot, scene, library, "route-health.json");
  const screenshotFile = join(engineRoot, scene, library, "screenshot.png");
  if (!existsSync(metricsFile) || !existsSync(routeFile) || !existsSync(screenshotFile)) return false;
  const metrics = JSON.parse(readFileSync(metricsFile, "utf8"));
  const route = JSON.parse(readFileSync(routeFile, "utf8"));
  return (
    metrics.routeHealth === "pass" &&
    metrics.screenshot === "screenshot.png" &&
    metrics.fpsInstrumentationStatus === "pass" &&
    metrics.fpsCalibration?.verdict?.status === "pass" &&
    Number.isFinite(metrics.p50Fps) &&
    Number.isFinite(metrics.p95FrameTimeMs) &&
    Number.isFinite(metrics.firstUsableRenderMs) &&
    Number.isFinite(metrics.bundleSizeGzipBytes) &&
    Number.isFinite(metrics.sourceLoc) &&
    route.status === "pass"
  );
}

function capture(scene, library) {
  if (allowResume && hasCompleteCapture(scene, library)) {
    console.log(`[skip] ${scene} ${library}`);
    return Promise.resolve({ scene, library, status: 0, skipped: true });
  }
  console.log(`[capture] ${scene} ${library}`);
  const child = spawn("node", [join(repoRoot, "benchmark/runner/capture-engine.mjs"), join(engineRoot, scene), library], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return new Promise((resolvePromise) => {
    child.on("close", (status, signal) => {
      writeFileSync(join(engineRoot, scene, library, "batch-capture.log"), output);
      console.log(`[done] ${scene} ${library} status=${status} signal=${signal ?? "none"}`);
      resolvePromise({ scene, library, status, signal, skipped: false });
    });
  });
}

const failures = [];
for (const scene of scenes) {
  for (const library of ["aura3d", "threejs"]) {
    const result = await capture(scene, library);
    if (!result.skipped && result.status !== 0) failures.push(result);
  }
}

if (failures.length > 0) {
  console.error(`Engine capture failures: ${failures.map((f) => `${f.scene}/${f.library}`).join(", ")}`);
  process.exit(1);
}
