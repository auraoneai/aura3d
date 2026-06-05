#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");

const manifestPath = path.join(appRoot, "launch-evidence.coverage.json");
const manifest = readJson(manifestPath);
const prdPath = path.resolve(appRoot, manifest.prd ?? "../../docs/project/aura-clash-showcase.md");
const outputPath = path.resolve(appRoot, manifest.output ?? "launch-evidence/prd-evidence-coverage.json");

const prd = readFile(prdPath);
const lines = prd.split(/\r?\n/);
const activeScopeEndHeading = manifest.activeScopeEndHeading ?? "# Legacy World War X PRD Archive";
const activeEndIndex = lines.findIndex((line) => line.trim() === activeScopeEndHeading);
const activeLines = activeEndIndex >= 0 ? lines.slice(0, activeEndIndex) : lines;
const unchecked = [];

for (let index = 0; index < activeLines.length; index += 1) {
  const line = activeLines[index];
  if (/^- \[ \] /.test(line)) {
    unchecked.push({
      line: index + 1,
      text: line.replace(/^- \[ \] /, "").trim()
    });
  }
}

const covered = [];
const uncovered = [];

for (const item of unchecked) {
  const rule = (manifest.rules ?? []).find((candidate) => matchesRule(item.text, candidate));
  if (rule) {
    covered.push({
      ...item,
      ruleId: rule.id,
      kind: rule.kind,
      requiredArtifacts: rule.requiredArtifacts ?? [],
      notes: rule.notes ?? ""
    });
  } else {
    uncovered.push(item);
  }
}

const report = {
  ok: uncovered.length === 0,
  generatedAt: new Date().toISOString(),
  manifest: toRepoRelative(manifestPath),
  prd: toRepoRelative(prdPath),
  activeScopeEndHeading,
  activeScopeLineCount: activeLines.length,
  totalUnchecked: unchecked.length,
  coveredUnchecked: covered.length,
  uncoveredUnchecked: uncovered.length,
  rules: (manifest.rules ?? []).map((rule) => ({
    id: rule.id,
    kind: rule.kind,
    requiredArtifacts: rule.requiredArtifacts ?? []
  })),
  covered,
  uncovered
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error(
    `PRD evidence coverage failed: ${uncovered.length} unchecked item(s) have no evidence rule. Report: ${toRepoRelative(outputPath)}`
  );
  for (const item of uncovered) {
    console.error(`- ${toRepoRelative(prdPath)}:${item.line} ${item.text}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `PRD evidence coverage ok: ${covered.length}/${unchecked.length} unchecked item(s) are mapped. Report: ${toRepoRelative(outputPath)}`
  );
}

function readJson(target) {
  return JSON.parse(readFile(target));
}

function readFile(target) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing required file: ${target}`);
  }
  return fs.readFileSync(target, "utf8");
}

function matchesRule(text, rule) {
  const normalized = text.toLowerCase();
  const match = rule.match ?? {};

  if (containsAny(normalized, match.excludeAny)) {
    return false;
  }

  const includesAll = match.includesAll ?? [];
  if (includesAll.length > 0 && !includesAll.every((value) => normalized.includes(String(value).toLowerCase()))) {
    return false;
  }

  if (containsAny(normalized, match.includesAny)) {
    return true;
  }

  const regexes = match.regex ?? [];
  return regexes.some((pattern) => new RegExp(pattern, "i").test(text));
}

function containsAny(normalized, values = []) {
  return values.some((value) => normalized.includes(String(value).toLowerCase()));
}

function toRepoRelative(target) {
  return path.relative(repoRoot, target).replaceAll(path.sep, "/");
}
