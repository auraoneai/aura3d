#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const documentationPath = path.resolve(repoRoot, "docs/examples/aura-clash.md");
const outPath = path.resolve(appRoot, "launch-evidence/documentation-evidence.json");
const requiredArtifacts = [
  "apps/aura-clash-showcase/tests/reports/flagship-gates.json",
  "apps/aura-clash-showcase/tests/reports/flagship-readiness.json",
  "apps/aura-clash-showcase/launch-evidence/first-frame.json",
  "apps/aura-clash-showcase/launch-evidence/review-package.md"
];
const text = fs.readFileSync(documentationPath, "utf8");
const artifacts = requiredArtifacts.map((relativePath) => {
  const absolutePath = path.resolve(repoRoot, relativePath);
  return { path: relativePath, exists: fs.existsSync(absolutePath) };
});
const failures = artifacts.filter((artifact) => !artifact.exists).map((artifact) => `Missing artifact: ${artifact.path}`);
if (!text.includes("docs/agents/claims-and-boundaries.md")) {
  failures.push("Aura Clash documentation must link to the canonical claim boundary.");
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  documentation: "docs/examples/aura-clash.md",
  artifacts,
  failures,
  boundary: "This check proves documentation-to-evidence wiring only; it does not grant human visual approval or deployment status."
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error("Aura Clash documentation evidence check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Aura Clash documentation evidence check passed.");
