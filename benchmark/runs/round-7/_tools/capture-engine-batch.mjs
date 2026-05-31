import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const roundRoot = resolve(repoRoot, "benchmark/runs/round-7");
const engineRoot = join(roundRoot, "engine");
const scenes = [
  "engine-01-material-grid",
  "engine-02-city-block",
  "engine-03-particles-vfx",
  "engine-04-physics-ramp",
  "engine-05-sneaker-product"
];

function hasScreenshot(scene, library) {
  const metricsFile = join(engineRoot, scene, library, "metrics.json");
  if (!existsSync(metricsFile)) return false;
  const metrics = JSON.parse(readFileSync(metricsFile, "utf8"));
  return metrics.routeHealth === "pass" && metrics.screenshot === "screenshot.png";
}

function capture(scene, library) {
  if (hasScreenshot(scene, library)) {
    console.log(`[skip] ${scene} ${library}`);
    return Promise.resolve({ scene, library, status: 0, skipped: true });
  }
  console.log(`[capture] ${scene} ${library}`);
  const child = spawn("node", [join(roundRoot, "_tools/capture-engine.mjs"), join(engineRoot, scene), library], {
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
