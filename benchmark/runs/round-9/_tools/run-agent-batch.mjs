import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const [, , runIdArg, startArg = "1", endArg = "10"] = process.argv;

if (!runIdArg) {
  console.error("Usage: node run-agent-batch.mjs <run-id> [start] [end]");
  process.exit(2);
}

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const roundRoot = resolve(repoRoot, "benchmark/runs/round-9");
const runRoot = join(roundRoot, runIdArg);
const start = Number(startArg);
const end = Number(endArg);
const allowResume = process.env.AURA3D_ALLOW_ROUND9_RESUME === "1";

function isDone(promptDir) {
  const metadataFile = join(promptDir, "run-metadata.json");
  if (!existsSync(metadataFile)) return false;
  const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
  return metadata.agentExitCode === 0;
}

function runOne(promptNumber) {
  const promptDir = join(runRoot, `prompt-${String(promptNumber).padStart(2, "0")}`);
  if (allowResume && isDone(promptDir)) {
    console.log(`[skip] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")} already completed`);
    return Promise.resolve({ promptNumber, status: 0, skipped: true });
  }

  console.log(`[start] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")}`);
  const child = spawn("node", [join(roundRoot, "_tools/run-agent.mjs"), promptDir], {
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
      writeFileSync(join(promptDir, "batch-run.log"), output);
      console.log(`[done] ${runIdArg} prompt-${String(promptNumber).padStart(2, "0")} status=${status} signal=${signal ?? "none"}`);
      resolvePromise({ promptNumber, status, signal, skipped: false });
    });
  });
}

const results = [];
for (let promptNumber = start; promptNumber <= end; promptNumber += 1) {
  results.push(await runOne(promptNumber));
}

const failures = results.filter((result) => !result.skipped && result.status !== 0);
if (failures.length > 0) {
  console.error(`Failed prompts: ${failures.map((result) => result.promptNumber).join(", ")}`);
  process.exit(1);
}
