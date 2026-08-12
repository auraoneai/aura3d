import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const outputPath = resolve(root, "tests/reports/markdown-2.0-audit.json");
const allowActiveFinalPrd = process.env.A3D_ALLOW_ACTIVE_FINAL_PRD === "1";
const retiredPathPatterns = [
  /^archive\/.*\.md$/i,
  /^docs\/archive\/.*\.md$/i,
  /^docs\/project\/plans\/.*\.md$/i,
  /(^|\/)ACCEPTANCE_PLAN\.md$/i,
  /(^|\/).*PRD.*\.md$/i,
  /^HANDOFF-1\.6\.md$/i,
  /^MIGRATION-1\.6\.md$/i,
  /^Aura3D-1\.6-/i,
  /^docs\/project\/aura3d-(?:109|140|141|142|143|144|145|160)-release/i,
  /^docs\/project\/parity\/threejs\/execution-plan\.md$/i,
  /^docs\/project\/showcase-application-plan\.md$/i,
  /^docs\/project\/showcase\/aura-clash-showcase-plan\.md$/i
];
const retiredReferences = [
  "docs/project/plans/",
  "docs/archive/",
  "archive/legacy-ai-runtime/",
  "archive/held-back-create-aura3d-templates/",
  "Aura3D-1.6-Replatform-PRD.md",
  "Aura3D-1.6-Architecture-Decision.md",
  "GameEngine-PRD.md",
  "HANDOFF-1.6.md",
  "MIGRATION-1.6.md",
  "docs/project/aura3d-109-release-gates.md",
  "docs/project/showcase/aura-clash-showcase-plan.md",
  "docs/project/showcase-application-plan.md",
  "docs/project/parity/threejs/execution-plan.md"
];

const markdownFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024
}).split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  .filter((path) => existsSync(resolve(root, path)))
  .filter((path) => !path.startsWith("tests/reports/"))
  .filter((path) => !path.startsWith("release-artifacts/"))
  .filter((path) => !path.includes("/node_modules/"))
  .sort();

const inventory = [];
const violations = [];
for (const path of markdownFiles) {
  const text = readFileSync(resolve(root, path), "utf8");
  if (text.trim().length === 0) {
    violations.push({ path, rule: "empty-markdown", detail: "tracked Markdown must contain current documentation" });
  } else if (!/^#\s+\S/m.test(text)) {
    violations.push({ path, rule: "missing-document-title", detail: "tracked Markdown must contain a level-one title" });
  }
  const versionHeader = text.match(/^Version:\s*(\d+\.\d+(?:\.\d+)?)/m)?.[1];
  if (versionHeader && versionHeader !== "2.0.0") {
    violations.push({ path, rule: "non-2.0-version-header", detail: `Version header is ${versionHeader}; expected 2.0.0` });
  }
  const retired = retiredPathPatterns.some((pattern) => pattern.test(path))
    && !(allowActiveFinalPrd && path === "1.6-FINAL-PRD-Finishes.md");
  if (retired) violations.push({ path, rule: "retired-markdown-path", detail: "planning/archive Markdown must be consolidated and removed" });

  for (const reference of (allowActiveFinalPrd && path === "1.6-FINAL-PRD-Finishes.md" ? [] : retiredReferences)) {
    if (text.includes(reference)) {
      violations.push({ path, rule: "retired-markdown-reference", detail: reference });
    }
  }

  const brokenLinks = findBrokenRelativeLinks(path, text);
  for (const link of brokenLinks) violations.push({ path, rule: "broken-relative-link", detail: link });
  inventory.push({
    path,
    classification: classify(path),
    bytes: Buffer.byteLength(text),
    lineCount: text.split(/\r?\n/).length,
    relativeLinkCount: [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].length,
    brokenLinks
  });
}

const report = {
  schema: "aura3d-markdown-2.0-audit/1.0",
  generatedAt: new Date().toISOString(),
  command: "pnpm check:markdown-2.0",
  version: readPackageVersion(),
  allowActiveFinalPrd,
  fileCount: inventory.length,
  classificationCounts: Object.fromEntries([...new Set(inventory.map((entry) => entry.classification))]
    .sort().map((classification) => [classification, inventory.filter((entry) => entry.classification === classification).length])),
  ok: violations.length === 0,
  violations,
  inventory
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, version: report.version, fileCount: report.fileCount, classificationCounts: report.classificationCounts, violations: report.violations }, null, 2));
if (!report.ok) process.exitCode = 1;

function readPackageVersion() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version ?? null;
}

function classify(path) {
  if (/(^|\/)AGENTS\.md$|(^|\/)(CLAUDE|copilot-instructions)\.md$/i.test(path)) return "agent-instruction";
  if (/(^|\/)ASSET-LICENSES\.md$|(^|\/)LICENSE[^/]*\.md$/i.test(path)) return "license";
  if (/(^|\/)README\.md$/i.test(path)) return "colocated-readme";
  if (/^docs\/architecture\/adr\//.test(path)) return "architecture-decision";
  if (/^benchmark\/context\//.test(path)) return "frozen-benchmark-context";
  if (/^benchmark\/(?:prompts|results)\//.test(path)) return "benchmark-input-or-result";
  if (/^docs\/project\/production-evidence\//.test(path)) return "production-evidence-index";
  if (/^(?:CHANGELOG|MIGRATION-2\.0|HANDOFF-2\.0)\.md$/.test(path)) return "release-document";
  if (/^docs\//.test(path)) return "current-documentation";
  if (/^(?:apps|examples|packages|templates|tests|fixtures|assets)\//.test(path)) return "colocated-documentation";
  return "repository-documentation";
}

function findBrokenRelativeLinks(path, text) {
  const broken = [];
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target || target.includes("{{") || target.includes("<")) continue;
    const decoded = decodeURIComponent(target);
    const resolved = resolve(root, dirname(path), decoded);
    if (!existsSync(resolved)) {
      broken.push(target);
      continue;
    }
    if (lstatSync(resolved).isDirectory() && extname(target)) broken.push(target);
  }
  return [...new Set(broken)].sort();
}
