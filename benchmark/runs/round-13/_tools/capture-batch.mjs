import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const [, , runIdArg, startArg = "1", endArg = "10"] = process.argv;

if (!runIdArg) {
  console.error("Usage: node capture-batch.mjs <run-id> [start] [end]");
  process.exit(2);
}

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const roundRoot = resolve(repoRoot, "benchmark/runs/round-13");
const runRoot = join(roundRoot, runIdArg);
const start = Number(startArg);
const end = Number(endArg);
const allowResume = process.env.AURA3D_ALLOW_ROUND13_RESUME === "1";

function hasMetrics(promptDir) {
  const metricsFile = join(promptDir, "metrics.json");
  if (!existsSync(metricsFile)) return false;
  const metrics = JSON.parse(readFileSync(metricsFile, "utf8"));
  const routeFile = join(promptDir, "route-health.json");
  const sourceListing = join(promptDir, "source-listing.md");
  const sourceManifest = join(promptDir, "source-manifest.json");
  const screenshot = join(promptDir, "screenshot.png");
  if (!existsSync(routeFile) || !existsSync(sourceListing) || !existsSync(sourceManifest) || !existsSync(screenshot)) return false;
  const route = JSON.parse(readFileSync(routeFile, "utf8"));
  return (
    metrics.compiles === true &&
    metrics.runsInBrowser === true &&
    metrics.routeHealth === "pass" &&
    metrics.screenshot === "screenshot.png" &&
    metrics.sourceEvidence?.listing === "source-listing.md" &&
    metrics.sourceEvidence?.manifest === "source-manifest.json" &&
    route.status === "pass" &&
    route.screenshotAnalysis?.nonblank === true
  );
}

function captureOne(promptNumber) {
  const promptDir = join(runRoot, `prompt-${String(promptNumber).padStart(2, "0")}`);
  if (allowResume && hasMetrics(promptDir)) {
    console.log(`[skip] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")} already captured`);
    return Promise.resolve({ promptNumber, status: 0, skipped: true });
  }

  console.log(`[capture] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")}`);
  const child = spawn("node", [join(roundRoot, "_tools/capture-run.mjs"), promptDir], {
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
      writeFileSync(join(promptDir, "batch-capture.log"), output);
      console.log(`[captured] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")} status=${status} signal=${signal ?? "none"}`);
      resolvePromise({ promptNumber, status, signal, skipped: false });
    });
  });
}

const results = [];
for (let promptNumber = start; promptNumber <= end; promptNumber += 1) {
  results.push(await captureOne(promptNumber));
}

const failures = results.filter((result) => !result.skipped && result.status !== 0);
if (failures.length > 0) {
  console.error(`Failed captures: ${failures.map((result) => result.promptNumber).join(", ")}`);
  process.exit(1);
}
