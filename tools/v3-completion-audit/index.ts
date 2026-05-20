import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const milestoneReports = [
  "tests/reports/v3-truth.json",
  "tests/reports/v3-progress.json",
  "tests/reports/v3-renderer-readiness.json",
  "tests/reports/v3-assets-readiness.json",
  "tests/reports/v3-workflows-readiness.json",
  "tests/reports/v3-app-suite-readiness.json",
  "tests/reports/v3-examples-readiness.json",
  "tests/reports/v3-package-smoke.json",
  "tests/reports/v3-external-consumer.json",
  "tests/reports/v3-threejs-comparison.json",
  "tests/reports/v3-docs-readiness.json",
  "tests/reports/v3-release-readiness.json"
] as const;
const requiredBuildFiles = [
  "packages/workflows/src/index.ts",
  "apps/asset-lab/src/main.ts",
  "apps/material-lab/src/main.ts",
  "apps/scene-lab/src/main.ts",
  "apps/game-lab/src/main.ts",
  "examples/asset-viewer-v3/main.ts",
  "examples/material-studio-v3/main.ts",
  "examples/product-configurator-v3/main.ts",
  "examples/interactive-scene-v3/main.ts",
  "examples/game-slice-v3/main.ts",
  "benchmarks/v3/galileo/asset-scene.ts",
  "benchmarks/v3/threejs/asset-scene.ts",
  "docs/project/v3-roadmap-product-positioning.md",
  "docs/project/v3-roadmap-known-gaps.md"
] as const;
const progress = existsSync(resolve("docs/project/v3-roadmap-progress.md")) ? readFileSync(resolve("docs/project/v3-roadmap-progress.md"), "utf8") : "";
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { readonly scripts?: Record<string, string> };
const reportChecks = milestoneReports.map((path) => {
  const report = existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Record<string, unknown> : undefined;
  return {
    path,
    exists: Boolean(report),
    pass: reportPasses(report)
  };
});
const buildFileChecks = requiredBuildFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const completedMilestones = Array.from({ length: 11 }, (_, index) => ({
  milestone: `Milestone ${index}`,
  checked: new RegExp(`- \\[x\\] Milestone ${index}\\b`, "i").test(progress)
}));
const releaseScript = packageJson.scripts?.["v3:release"] ?? "";
const releaseScriptIncludesAllGates = [
  "v3:truth",
  "v3:progress",
  "typecheck",
  "v3:renderer",
  "v3:assets",
  "v3:workflows",
  "v3:apps",
  "v3:examples",
  "v3:package",
  "v3:compare-threejs",
  "v3:docs",
  "v3-release-readiness",
  "v3-completion-audit"
].every((token) => releaseScript.includes(token));
const report = {
  schema: "g3d-v3-completion-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: reportChecks.every((check) => check.pass)
    && buildFileChecks.every((check) => check.exists)
    && completedMilestones.every((milestone) => milestone.checked)
    && progress.includes("Current status: complete")
    && progress.includes("Current milestone: complete")
    && releaseScriptIncludesAllGates,
  reportChecks,
  buildFileChecks,
  completedMilestones,
  progressStatus: {
    complete: progress.includes("Current status: complete"),
    milestoneComplete: progress.includes("Current milestone: complete")
  },
  releaseScriptIncludesAllGates
};

const output = resolve("tests/reports/v3-completion-audit.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function reportPasses(report: Record<string, unknown> | undefined): boolean {
  if (!report) return false;
  if (typeof report.pass === "boolean") return report.pass;
  if (typeof report.ok === "boolean") return report.ok;
  return false;
}
