import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/production-runtime-roadmap-production-renderer-plan.md",
  "docs/project/production-runtime-roadmap-status.md",
  "docs/project/production-runtime-roadmap-progress.md",
  "docs/project/production-runtime-roadmap-three-compat-visual-failure-audit.md",
  "docs/project/production-runtime-roadmap-no-fake-visual-proof.md",
  "docs/project/production-runtime-roadmap-known-gaps.md",
  "docs/project/production-runtime-roadmap-blocked-claims.md",
  "tools/production-runtime-truth/index.ts",
  "tools/production-runtime-progress/index.ts",
  "tools/production-runtime-three-compat-failure-audit/index.ts"
] as const;
const productionRuntime = read("docs/project/production-runtime-roadmap-production-renderer-plan.md");
const status = read("docs/project/production-runtime-roadmap-status.md");
const progress = read("docs/project/production-runtime-roadmap-progress.md");
const blockedClaims = read("docs/project/production-runtime-roadmap-blocked-claims.md");
const requiredPlanPatterns = [
  /Production Renderer V6/i,
  /real WebGL2\/WebGPU browser renderer/i,
  /No Canvas 2D fallback/i,
  /Real WebGL2 Renderer Backend/i,
  /Real WebGPU Renderer Backend/i,
  /Real glTF Render Pipeline/i,
  /Same-Scene Three\.js Parity/i,
  /Final Completion Definition/i
] as const;
const requiredStatusPatterns = [
  /not complete until `pnpm production-runtime:release` passes/i,
  /real WebGL2\/WebGPU renderer output/i,
  /fake visual proof/i
] as const;
const requiredBlockedClaims = [
  "Full Three.js API replacement",
  "Full Three.js ecosystem replacement",
  "Full WebGPU parity",
  "Unity replacement",
  "Unreal replacement",
  "Broad performance superiority"
] as const;
const missing = requiredFiles.filter((path) => !existsSync(resolve(path)));
const missingPlanPatterns = requiredPlanPatterns.filter((pattern) => !pattern.test(productionRuntime)).map(String);
const missingStatusPatterns = requiredStatusPatterns.filter((pattern) => !pattern.test(status)).map(String);
const missingBlockedClaims = requiredBlockedClaims.filter((claim) => !blockedClaims.includes(claim));
const progressHasAllMilestones = Array.from({ length: 19 }, (_, index) => `Milestone ${index}`).every((milestone) => progress.includes(milestone));
const progressClaimsComplete = /^Current status:\s*complete$/m.test(progress);
const completionAuditPasses = reportPasses("tests/reports/production-runtime-completion-audit.json");
const progressNotPrematureComplete = !progressClaimsComplete || completionAuditPasses;
const threeCompatFailureAuditPasses = reportPasses("tests/reports/production-runtime-three-compat-visual-failure-audit.json");
const checks = [
  { id: "required-files", pass: missing.length === 0, detail: missing.join(", ") || "all required Milestone 0 files exist" },
  { id: "plan-patterns", pass: missingPlanPatterns.length === 0, detail: missingPlanPatterns.join(", ") || "V6 defines production renderer plan" },
  { id: "status-patterns", pass: missingStatusPatterns.length === 0, detail: missingStatusPatterns.join(", ") || "status defines real renderer completion boundary" },
  { id: "blocked-claims", pass: missingBlockedClaims.length === 0, detail: missingBlockedClaims.join(", ") || "blocked claims are preserved" },
  { id: "milestone-coverage", pass: progressHasAllMilestones, detail: "progress lists Milestones 0-18" },
  { id: "not-premature-complete", pass: progressNotPrematureComplete, detail: "progress is not complete before completion audit passes" },
  { id: "three-compat-failure-audit", pass: threeCompatFailureAuditPasses, detail: "V5 visual failure audit report passes" }
];
const report = {
  schema: "g3d-production-runtime-truth/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  checks
};
writeJson("tests/reports/production-runtime-truth.json", report);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function reportPasses(path: string): boolean {
  if (!existsSync(resolve(path))) return false;
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"))?.pass === true;
  } catch {
    return false;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
