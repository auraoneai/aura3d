#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const documentationPath = path.resolve(repoRoot, "docs/examples/aura-clash.md");
const outPath = path.resolve(
  appRoot,
  process.env.AURA_CLASH_DOCUMENTATION_AUDIT_OUT ?? "launch-evidence/documentation-audit.json"
);
const requiredPhrases = [
  "# Aura Clash",
  "Aura3D 2.0",
  "typed GLB",
  "Human visual approval",
  "machine checks"
];
const text = fs.readFileSync(documentationPath, "utf8");
const failures = [];

for (const phrase of requiredPhrases) {
  if (!text.toLowerCase().includes(phrase.toLowerCase())) failures.push(`Missing required phrase: ${phrase}`);
}
if (/^- \[[ xX]\]/m.test(text)) failures.push("Documentation must not contain project-tracking checkboxes.");
if (/\b(?:PRD|prompt)\b/i.test(text)) failures.push("Documentation must not present itself as a PRD or prompt.");
if (/\b1\.[0-9]+(?:\.[0-9]+)?\b/.test(text)) failures.push("Documentation contains a retired 1.x version reference.");

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  documentation: path.relative(repoRoot, documentationPath).replaceAll(path.sep, "/"),
  failures,
  boundary: "This is a read-only documentation integrity check. It never edits documentation or records human approval."
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error("Aura Clash documentation integrity check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Aura Clash documentation integrity check passed: ${report.documentation}`);
