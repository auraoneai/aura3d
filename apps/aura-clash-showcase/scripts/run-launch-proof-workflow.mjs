#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_WORKFLOW_OUT ?? "launch-evidence/workflow.json"
);

const runDeployedEvidence = process.env.AURA_CLASH_RUN_DEPLOYED_EVIDENCE === "1";
const runVercelDeploy = process.env.AURA_CLASH_RUN_VERCEL_DEPLOY === "1";
const runCrossRuntimeEvidence = process.env.AURA_CLASH_RUN_CROSS_RUNTIME_EVIDENCE === "1";
const runPrdEvidenceCoverage = process.env.AURA_CLASH_RUN_PRD_EVIDENCE_COVERAGE === "1";
const runCommandPlanCheck = process.env.AURA_CLASH_RUN_COMMAND_PLAN_CHECK === "1";
const runCommandPlan = process.env.AURA_CLASH_RUN_COMMAND_PLAN === "1";
const runEvidenceWiringCheck = process.env.AURA_CLASH_RUN_EVIDENCE_WIRING_CHECK === "1";
const runReadinessReport = process.env.AURA_CLASH_RUN_READINESS_REPORT === "1";
const runCompletionAudit = process.env.AURA_CLASH_RUN_COMPLETION_AUDIT === "1";
const updatePrd = process.env.AURA_CLASH_UPDATE_PRD === "1";
const dryRunPrd = process.env.AURA_CLASH_PRD_UPDATE_DRY_RUN ?? (updatePrd ? "0" : "1");

const steps = [
  {
    id: "local-gates",
    command: "npm",
    args: ["run", "launch:local-gates"],
    cwd: appRoot
  },
  {
    id: "first-frame-screenshot",
    command: "npm",
    args: ["run", "launch:screenshot"],
    cwd: appRoot
  },
  {
    id: "review-package",
    command: "npm",
    args: ["run", "launch:review-package"],
    cwd: appRoot
  }
];

if (runVercelDeploy) {
  steps.push({
    id: "vercel-deploy",
    command: "npm",
    args: ["run", "launch:deploy"],
    cwd: appRoot
  });
}

if (runDeployedEvidence) {
  steps.push({
    id: "deployed-route-evidence",
    command: "npm",
    args: ["run", "launch:evidence"],
    cwd: appRoot
  });
}

if (runCommandPlanCheck) {
  steps.push({
    id: "command-plan-check",
    command: "npm",
    args: ["run", "launch:command-plan-check"],
    cwd: appRoot
  });
}

if (runCommandPlan) {
  steps.push({
    id: "command-plan",
    command: "npm",
    args: ["run", "launch:command-plan"],
    cwd: appRoot
  });
}

if (runEvidenceWiringCheck) {
  steps.push({
    id: "evidence-wiring-check",
    command: "npm",
    args: ["run", "launch:wiring-check"],
    cwd: appRoot
  });
}

if (runCrossRuntimeEvidence) {
  steps.push({
    id: "cross-runtime-evidence",
    command: "npm",
    args: ["run", "launch:cross-runtime-evidence"],
    cwd: appRoot
  });
}

if (runPrdEvidenceCoverage) {
  steps.push({
    id: "prd-evidence-coverage",
    command: "npm",
    args: ["run", "launch:coverage-check"],
    cwd: appRoot
  });
}

if (runReadinessReport) {
  steps.push({
    id: "readiness-report",
    command: "npm",
    args: ["run", "launch:readiness"],
    cwd: appRoot
  });
}

steps.push({
  id: updatePrd ? "update-prd" : "dry-run-update-prd",
  command: "npm",
  args: ["run", "launch:update-prd"],
  cwd: appRoot,
  env: {
    AURA_CLASH_PRD_UPDATE_DRY_RUN: dryRunPrd
  }
});

if (runCompletionAudit) {
  steps.push({
    id: "completion-audit",
    command: "npm",
    args: ["run", "launch:completion-check"],
    cwd: appRoot
  });
}

const startedAt = new Date().toISOString();
const results = [];

for (const step of steps) {
  const result = await runStep(step);
  results.push(result);

  if (!result.ok && process.env.AURA_CLASH_CONTINUE_ON_FAILURE !== "1") {
    break;
  }
}

const failed = results.filter((result) => !result.ok);
const evidence = {
  ok: failed.length === 0 && results.length === steps.length,
  generatedAt: new Date().toISOString(),
  startedAt,
  appRoot,
  runDeployedEvidence,
  runVercelDeploy,
  runCrossRuntimeEvidence,
  runPrdEvidenceCoverage,
  runCommandPlanCheck,
  runCommandPlan,
  runEvidenceWiringCheck,
  runReadinessReport,
  runCompletionAudit,
  updatePrd,
  dryRunPrd,
  stepCount: steps.length,
  completedCount: results.length,
  failedCount: failed.length,
  results
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);

if (!evidence.ok) {
  console.error(`Aura Clash launch proof workflow failed.`);
  console.error(`Evidence written to ${outPath}`);
  process.exit(1);
}

console.log(`Aura Clash launch proof workflow passed.`);
console.log(`Evidence written to ${outPath}`);

function runStep(step) {
  const started = Date.now();
  console.log(`\n[${step.id}] ${step.command} ${step.args.join(" ")}`);

  return new Promise((resolveResult) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(step.env ?? {})
      }
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
        ...step,
        ok: false,
        error: error.message,
        durationMs: Date.now() - started,
        stdout,
        stderr
      });
    });

    child.on("close", (code, signal) => {
      resolveResult({
        ...step,
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
