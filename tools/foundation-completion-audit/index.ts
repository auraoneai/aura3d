import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const milestoneReports = [
  "tests/reports/foundation-truth.json",
  "tests/reports/foundation-progress.json",
  "tests/reports/foundation-renderer-readiness.json",
  "tests/reports/foundation-assets-readiness.json",
  "tests/reports/foundation-workflows-readiness.json",
  "tests/reports/foundation-app-suite-readiness.json",
  "tests/reports/foundation-package-smoke.json",
  "tests/reports/foundation-external-consumer.json",
  "tests/reports/foundation-threejs-comparison.json",
  "tests/reports/foundation-docs-readiness.json",
  "tests/reports/foundation-release-readiness.json"
] as const;
const requiredBuildFiles = [
  "packages/workflows/src/index.ts",
  "apps/asset-lab/src/main.ts",
  "apps/material-lab/src/main.ts",
  "apps/scene-lab/src/main.ts",
  "apps/game-lab/src/main.ts",
  "benchmarks/foundation/aura3d/asset-scene.ts",
  "benchmarks/foundation/threejs/asset-scene.ts",
  "docs/project/competitive-positioning.md",
  "docs/project/known-limits.md"
] as const;
const progress = existsSync(resolve("docs/project/verification-evidence.md")) ? readFileSync(resolve("docs/project/verification-evidence.md"), "utf8") : "";
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
const releaseScript = packageJson.scripts?.["foundation:release"] ?? "";
const releaseScriptIncludesAllGates = [
  "foundation:truth",
  "foundation:progress",
  "typecheck",
  "foundation:renderer",
  "foundation:assets",
  "foundation:workflows",
  "foundation:apps",
  "foundation:package",
  "foundation:compare-threejs",
  "foundation:docs",
  "foundation-release-readiness",
  "foundation-completion-audit"
].every((token) => releaseScript.includes(token));
const report = {
  schema: "a3d-foundation-completion-audit",
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

const output = resolve("tests/reports/foundation-completion-audit.json");
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
