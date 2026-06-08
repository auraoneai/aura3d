#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const planPath = resolve(
  process.cwd(),
  process.argv[2] ?? "apps/aura-clash-showcase/launch-evidence.command-plan.json"
);

if (!existsSync(planPath)) {
  fail(`Command plan does not exist: ${planPath}`);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const groups = [
  "auraClashLocal",
  "auraClashDeploy",
  "aura3d104",
  "promptAnimation",
  "finalAggregation"
];
const requiredOutputSubstrings = [
  "launch-evidence/local-gates.json",
  "launch-evidence/first-frame.json",
  "launch-evidence/visual-approval.json",
  "launch-evidence/vercel-deploy.json",
  "launch-evidence/deployed-routes.json",
  "tests/reports/aura3d104/typecheck.json",
  "tests/reports/aura3d104/build.json",
  "tests/reports/aura3d104/dist-agent-api-types.json",
  "tests/reports/aura3d104/validation-suite.json",
  "tests/reports/game-runtime/unit.json",
  "tests/reports/game-runtime/browser.json",
  "tests/reports/game-runtime/template.json",
  "tests/reports/game-runtime/docs.json",
  "tests/reports/game-runtime/game-runtime-evidence.json",
  "tests/reports/game-runtime/package-smoke.json",
  "tests/reports/game-runtime/release.json",
  "tests/reports/game-runtime/typecheck.log",
  "tests/reports/game-runtime/unit.log",
  "tests/reports/game-runtime/browser.log",
  "tests/reports/game-runtime/template.log",
  "tests/reports/game-runtime/docs.log",
  "tests/reports/game-runtime/evidence.log",
  "tests/reports/game-runtime/package.log",
  "tests/reports/game-runtime/release.log",
  "tests/reports/game-runtime/build.log",
  "tests/reports/prompt-animation/unit.json",
  "tests/reports/prompt-animation/browser.json",
  "tests/reports/prompt-animation/template.json",
  "tests/reports/prompt-animation/docs.json",
  "tests/reports/prompt-animation/auravoice-contract-proof.json",
  "tests/reports/prompt-animation/auravoice-sample-render-gates.json",
  "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json",
  "tests/reports/prompt-animation/validate-animation.json",
  "tests/reports/prompt-animation/viseme-sync-proof.json",
  "tests/reports/prompt-animation/dub-sync-proof.json",
  "tests/reports/prompt-animation/prompt-animation-evidence.json",
  "tests/reports/prompt-animation/package-smoke.json",
  "tests/reports/prompt-animation/release.json",
  "tests/reports/prompt-animation/unit.log",
  "tests/reports/prompt-animation/browser.log",
  "tests/reports/prompt-animation/template.log",
  "tests/reports/prompt-animation/docs.log",
  "tests/reports/prompt-animation/auravoice-contract.log",
  "tests/reports/prompt-animation/auravoice-render.log",
  "tests/reports/prompt-animation/validate-animation.log",
  "tests/reports/prompt-animation/viseme-sync.log",
  "tests/reports/prompt-animation/dub-sync.log",
  "tests/reports/prompt-animation/evidence.log",
  "tests/reports/prompt-animation/package.log",
  "tests/reports/prompt-animation/release.log",
  "launch-evidence/cross-runtime-evidence.json"
];

const entries = [];
const errors = [];

for (const group of groups) {
  const value = plan[group];

  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`Missing or empty group: ${group}`);
    continue;
  }

  for (const item of value) {
    const outputs = item.outputs ?? (item.output ? [item.output] : []);
    entries.push({
      group,
      id: item.id,
      command: item.command,
      outputs
    });

    if (!item.id) {
      errors.push(`${group} entry is missing id`);
    }

    if (!item.command) {
      errors.push(`${group}:${item.id ?? "<missing>"} is missing command`);
    }

    if (outputs.length === 0) {
      errors.push(`${group}:${item.id ?? "<missing>"} is missing output(s)`);
    }
  }
}

const allOutputText = entries.flatMap((entry) => entry.outputs).join("\n");

for (const expected of requiredOutputSubstrings) {
  if (!allOutputText.includes(expected)) {
    errors.push(`Command plan does not declare required output: ${expected}`);
  }
}

const duplicateIds = findDuplicates(entries.map((entry) => entry.id).filter(Boolean));

for (const duplicate of duplicateIds) {
  errors.push(`Duplicate command-plan id: ${duplicate}`);
}

const report = {
  ok: errors.length === 0,
  planPath,
  groupCount: groups.length,
  entryCount: entries.length,
  requiredOutputCount: requiredOutputSubstrings.length,
  duplicateIds,
  errors
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return [...duplicates];
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
