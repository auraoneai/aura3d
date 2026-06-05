#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const marketingRoot = resolve(repoRoot, "marketing");
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_LOCAL_GATES_OUT ?? "launch-evidence/local-gates.json"
);

const prdGates = [
  {
    id: "build-app-and-marketing",
    prdLineHint: 463,
    prdLabel: "Build app and marketing site.",
    requiredResultIds: ["aura-clash-build", "marketing-build"],
    artifact: "apps/aura-clash-showcase/launch-evidence/local-gates.json"
  },
  {
    id: "gameplay-smoke",
    prdLineHint: 491,
    prdLabel:
      "Gameplay smoke passes. Source strengthened in `apps/aura-clash-showcase/tests/playable-smoke.spec.ts` for runtime responsiveness and no-scene-reconstruction hooks, but no pass is claimed until executed evidence exists.",
    requiredResultIds: ["playable-smoke"],
    artifact: "apps/aura-clash-showcase/launch-evidence/local-gates.json"
  }
];

const commands = [
  {
    id: "assets-check",
    cwd: appRoot,
    command: "npm",
    args: ["run", "assets:check"]
  },
  {
    id: "assets-validate-game",
    cwd: appRoot,
    command: "node",
    args: [
      "../../packages/aura3d-cli/dist/cli.js",
      "assets",
      "validate-game",
      "--asset",
      "v4UAL1Standard",
      "--output",
      "launch-evidence/assets-validate-game.json"
    ]
  },
  {
    id: "routes-check",
    cwd: appRoot,
    command: "npm",
    args: ["run", "routes:check"]
  },
  {
    id: "aura-clash-build",
    cwd: appRoot,
    command: "npm",
    args: ["run", "build"]
  },
  {
    id: "playable-smoke",
    cwd: appRoot,
    command: "npm",
    args: ["run", "test:playable"]
  },
  {
    id: "screenshot-smoke",
    cwd: appRoot,
    command: "npm",
    args: ["run", "test:screenshot"]
  },
  {
    id: "route-health",
    cwd: appRoot,
    command: "npm",
    args: ["run", "test:route-health"]
  },
  {
    id: "deploy-check",
    cwd: appRoot,
    command: "npm",
    args: ["run", "test:deploy"]
  },
  {
    id: "marketing-build",
    cwd: marketingRoot,
    command: "npm",
    args: ["run", "build"]
  }
];

const startedAt = new Date().toISOString();
const results = [];

for (const item of commands) {
  const result = await runCommand(item);
  results.push(result);

  if (!result.ok && process.env.AURA_CLASH_CONTINUE_ON_FAILURE !== "1") {
    break;
  }
}

const failed = results.filter((result) => !result.ok);
const evidence = {
  ok: failed.length === 0 && results.length === commands.length,
  generatedAt: new Date().toISOString(),
  startedAt,
  appRoot,
  marketingRoot,
  commandCount: commands.length,
  completedCount: results.length,
  failedCount: failed.length,
  results,
  prdGateCoverage: []
};
evidence.prdGateCoverage = createPrdGateCoverage(evidence.ok, results);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

if (!evidence.ok) {
  console.error(`Aura Clash local launch gates failed.`);
  console.error(`Evidence written to ${outPath}`);
  process.exit(1);
}

console.log(`Aura Clash local launch gates passed.`);
console.log(`Evidence written to ${outPath}`);

function runCommand(item) {
  const started = Date.now();
  console.log(`\n[${item.id}] ${item.command} ${item.args.join(" ")}`);

  return new Promise((resolveResult) => {
    const child = spawn(item.command, item.args, {
      cwd: item.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      resolveResult({
        ...item,
        ok: false,
        error: error.message,
        durationMs: Date.now() - started,
        stdout,
        stderr
      });
    });

    child.on("close", (code, signal) => {
      resolveResult({
        ...item,
        ok: code === 0,
        code,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr
      });
    });
  });
}

function createPrdGateCoverage(overallOk, commandResults) {
  const resultById = new Map(commandResults.map((result) => [result.id, result]));

  return prdGates.map((gate) => {
    const requiredResults = gate.requiredResultIds.map((resultId) => {
      const result = resultById.get(resultId);
      return {
        id: resultId,
        found: Boolean(result),
        ok: result?.ok === true
      };
    });

    return {
      ...gate,
      requiresOverallOk: true,
      ok: overallOk && requiredResults.every((result) => result.ok),
      requiredResults
    };
  });
}
