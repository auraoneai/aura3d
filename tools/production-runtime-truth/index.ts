import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/current-state.md",
  "docs/project/threejs-parity-status.md",
  "docs/project/known-limits.md",
  "docs/project/claim-guidelines.md",
  "docs/project/verification-evidence.md",
  "tools/production-runtime-truth/index.ts",
  "tools/production-runtime-progress/index.ts",
  "tools/production-runtime-three-compat-failure-audit/index.ts"
] as const;
const productionRuntime = read("docs/project/current-state.md");
const status = read("docs/project/verification-evidence.md");
const progress = read("docs/project/completion-audit.md");
const blockedClaims = [
  read("docs/project/known-limits.md"),
  read("docs/project/claim-guidelines.md")
].join("\n");
const requiredPlanPatterns = [
  /production runtime/i,
  /real WebGL2\/WebGPU browser renderer/i,
  /No Canvas 2D fallback/i,
  /WebGL2/i,
  /WebGPU/i,
  /glTF/i,
  /Three\.js/i
] as const;
const requiredStatusPatterns = [
  /evidence/i,
  /report/i,
  /verification/i
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
const progressHasAllMilestones = progress.includes("release") || progress.includes("verification") || progress.includes("complete");
const progressClaimsComplete = /^Current status:\s*complete$/m.test(progress);
const completionAuditPasses = reportPasses("tests/reports/production-runtime-completion-audit.json");
const progressNotPrematureComplete = !progressClaimsComplete || completionAuditPasses;
const threeCompatFailureAuditPasses = reportPasses("tests/reports/production-runtime-three-compat-visual-failure-audit.json");
const checks = [
  { id: "required-files", pass: missing.length === 0, detail: missing.join(", ") || "all required retained production-runtime evidence files exist" },
  { id: "plan-patterns", pass: missingPlanPatterns.length === 0, detail: missingPlanPatterns.join(", ") || "production renderer plan is covered by retained docs" },
  { id: "status-patterns", pass: missingStatusPatterns.length === 0, detail: missingStatusPatterns.join(", ") || "status defines real renderer completion boundary" },
  { id: "blocked-claims", pass: missingBlockedClaims.length === 0, detail: missingBlockedClaims.join(", ") || "blocked claims are preserved" },
  { id: "milestone-coverage", pass: progressHasAllMilestones, detail: "retained completion docs describe release verification progress" },
  { id: "not-premature-complete", pass: progressNotPrematureComplete, detail: "progress is not complete before completion audit passes" },
  { id: "three-compat-failure-audit", pass: threeCompatFailureAuditPasses, detail: "Three.js compatibility visual failure audit report passes" }
];
const report = {
  schema: "a3d-production-runtime-truth",
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
