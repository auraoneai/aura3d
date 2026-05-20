import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/v6-roadmap-production-renderer-plan.md",
  "docs/project/v6-roadmap-status.md",
  "docs/project/v6-roadmap-progress.md",
  "docs/project/v6-roadmap-v5-visual-failure-audit.md",
  "docs/project/v6-roadmap-no-fake-visual-proof.md",
  "docs/project/v6-roadmap-known-gaps.md",
  "docs/project/v6-roadmap-blocked-claims.md",
  "tools/v6-truth/index.ts",
  "tools/v6-progress/index.ts",
  "tools/v6-v5-failure-audit/index.ts"
] as const;
const v6 = read("docs/project/v6-roadmap-production-renderer-plan.md");
const status = read("docs/project/v6-roadmap-status.md");
const progress = read("docs/project/v6-roadmap-progress.md");
const blockedClaims = read("docs/project/v6-roadmap-blocked-claims.md");
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
  /not complete until `pnpm v6:release` passes/i,
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
const missingPlanPatterns = requiredPlanPatterns.filter((pattern) => !pattern.test(v6)).map(String);
const missingStatusPatterns = requiredStatusPatterns.filter((pattern) => !pattern.test(status)).map(String);
const missingBlockedClaims = requiredBlockedClaims.filter((claim) => !blockedClaims.includes(claim));
const progressHasAllMilestones = Array.from({ length: 19 }, (_, index) => `Milestone ${index}`).every((milestone) => progress.includes(milestone));
const progressClaimsComplete = /^Current status:\s*complete$/m.test(progress);
const completionAuditPasses = reportPasses("tests/reports/v6-completion-audit.json");
const progressNotPrematureComplete = !progressClaimsComplete || completionAuditPasses;
const v5FailureAuditPasses = reportPasses("tests/reports/v6-v5-visual-failure-audit.json");
const checks = [
  { id: "required-files", pass: missing.length === 0, detail: missing.join(", ") || "all required Milestone 0 files exist" },
  { id: "plan-patterns", pass: missingPlanPatterns.length === 0, detail: missingPlanPatterns.join(", ") || "V6 defines production renderer plan" },
  { id: "status-patterns", pass: missingStatusPatterns.length === 0, detail: missingStatusPatterns.join(", ") || "status defines real renderer completion boundary" },
  { id: "blocked-claims", pass: missingBlockedClaims.length === 0, detail: missingBlockedClaims.join(", ") || "blocked claims are preserved" },
  { id: "milestone-coverage", pass: progressHasAllMilestones, detail: "progress lists Milestones 0-18" },
  { id: "not-premature-complete", pass: progressNotPrematureComplete, detail: "progress is not complete before completion audit passes" },
  { id: "v5-failure-audit", pass: v5FailureAuditPasses, detail: "V5 visual failure audit report passes" }
];
const report = {
  schema: "g3d-v6-truth/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  checks
};
writeJson("tests/reports/v6-truth.json", report);
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
