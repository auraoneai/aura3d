#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");

const coveragePath = path.join(appRoot, "launch-evidence.coverage.json");
const commandPlanPath = path.join(appRoot, "launch-evidence.command-plan.json");
const manifestPath = path.join(appRoot, "launch-evidence.manifest.json");
const outPath = path.join(appRoot, "launch-evidence/evidence-wiring.json");

const coverage = readJson(coveragePath);
const commandPlan = readJson(commandPlanPath);
const manifest = readJson(manifestPath);

const knownArtifacts = new Set();
const knownSources = [];

collectCommandPlanArtifacts(commandPlan, knownArtifacts);
collectManifestArtifacts(manifest, knownArtifacts);
collectManifestSourceFiles(manifest, knownArtifacts);

const coverageArtifacts = [];
const unknown = [];

for (const rule of coverage.rules ?? []) {
  for (const artifact of rule.requiredArtifacts ?? []) {
    const normalized = normalizeArtifact(artifact);
    const record = {
      ruleId: rule.id,
      kind: rule.kind,
      artifact: normalized,
      known: false,
      reason: ""
    };

    if (normalized.includes("*")) {
      record.known = true;
      record.reason = "wildcard evidence class";
    } else if (knownArtifacts.has(normalized)) {
      record.known = true;
      record.reason = "declared by command plan, launch manifest, or sourceEvidence";
    } else if (fs.existsSync(path.resolve(repoRoot, normalized))) {
      record.known = true;
      record.reason = "current source/static artifact exists";
    } else {
      unknown.push(record);
    }

    coverageArtifacts.push(record);
  }
}

const report = {
  ok: unknown.length === 0,
  generatedAt: new Date().toISOString(),
  coverage: toRepoRelative(coveragePath),
  commandPlan: toRepoRelative(commandPlanPath),
  manifest: toRepoRelative(manifestPath),
  knownArtifactCount: knownArtifacts.size,
  coverageArtifactCount: coverageArtifacts.length,
  unknownArtifactCount: unknown.length,
  knownSources,
  coverageArtifacts,
  unknown
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(
    `Evidence wiring check failed: ${unknown.length} coverage artifact(s) are not declared or present. Report: ${toRepoRelative(outPath)}`
  );
  for (const item of unknown) {
    console.error(`- ${item.ruleId}: ${item.artifact}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Evidence wiring check ok: ${coverageArtifacts.length} coverage artifact reference(s) are wired. Report: ${toRepoRelative(outPath)}`
  );
}

function collectCommandPlanArtifacts(plan, target) {
  for (const [groupName, entries] of Object.entries(plan)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    knownSources.push(`command-plan:${groupName}`);

    for (const entry of entries) {
      addArtifact(entry.output, target);
      for (const output of entry.outputs ?? []) {
        addArtifact(output, target);
      }
    }
  }
}

function collectManifestArtifacts(source, target) {
  knownSources.push("launch-evidence.manifest.json:commands");

  for (const entry of Object.values(source.commands ?? {})) {
    addArtifact(entry?.output, target);
    for (const output of entry?.outputs ?? []) {
      addArtifact(output, target);
    }
    for (const input of entry?.inputs ?? []) {
      addArtifact(input, target);
    }
  }
}

function collectManifestSourceFiles(source, target) {
  knownSources.push("launch-evidence.manifest.json:sourceEvidence");

  for (const entry of Object.values(source.sourceEvidence ?? {})) {
    for (const file of entry?.files ?? []) {
      addArtifact(file, target);
    }
  }
}

function addArtifact(value, target) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  target.add(normalizeArtifact(value));
}

function normalizeArtifact(value) {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("apps/aura-clash-showcase/")) {
    return normalized;
  }

  if (normalized.startsWith("launch-evidence/") || normalized.startsWith("assets/") || normalized === "aura.assets.json") {
    return `apps/aura-clash-showcase/${normalized}`;
  }

  return normalized;
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function toRepoRelative(target) {
  return path.relative(repoRoot, target).replaceAll(path.sep, "/");
}
