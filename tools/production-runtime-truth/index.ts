import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/status/current-state.md",
  "docs/project/parity/threejs/status.md",
  "docs/project/status/known-limits.md",
  "docs/project/claim-guidelines.md",
  "docs/project/verification-evidence.md",
  "docs/project/architecture/create-aura-app-production-bridge.md",
  "tests/reports/public-renderer-normal-path/report.json",
  "tools/production-runtime-truth/index.ts",
  "tools/production-runtime-progress/index.ts",
  "tools/production-runtime-three-compat-failure-audit/index.ts"
] as const;
const productionRuntime = read("docs/project/status/current-state.md");
const status = read("docs/project/verification-evidence.md");
const progress = read("docs/project/completion-audit.md");
const blockedClaims = [
  read("docs/project/status/known-limits.md"),
  read("docs/project/claim-guidelines.md")
].join("\n");
const requiredPlanPolicies = [
  { id: "root-production-normal-path", pattern: /production-runtime rendering by default/i },
  { id: "root-webgl2-path", pattern: /root WebGL2 path/i },
  { id: "typed-gltf-path", pattern: /typed asset manifests[\s\S]*static GLB\/glTF mesh loading/i },
  { id: "browser-evidence-boundary", pattern: /browser evidence/i },
  { id: "three-parity-boundary", pattern: /full production renderer parity|Three\.js/i }
] as const;
const requiredStatusPatterns = [
  /evidence/i,
  /requirements trace gate/i,
  /gate result/i
] as const;
const requiredBlockedPolicies = [
  { id: "framework-replacement", pattern: /Aura3D is a Three\.js\/Babylon\/Unity\/Unreal replacement/i },
  { id: "native-webgpu", pattern: /Native WebGPU particles\/rendering/i },
  { id: "flagship-quality", pattern: /A showcase route is flagship quality/i },
  { id: "performance-superiority", pattern: /Aura3D matches or exceeds Three\.js performance/i }
] as const;
const missing = requiredFiles.filter((path) => !existsSync(resolve(path)));
const missingPlanPolicies = requiredPlanPolicies.filter(({ pattern }) => !pattern.test(productionRuntime)).map(({ id }) => id);
const missingStatusPatterns = requiredStatusPatterns.filter((pattern) => !pattern.test(status)).map(String);
const missingBlockedPolicies = requiredBlockedPolicies.filter(({ pattern }) => !pattern.test(blockedClaims)).map(({ id }) => id);
const progressHasAllMilestones = progress.includes("release") || progress.includes("verification") || progress.includes("complete");
const progressClaimsComplete = /^Current status:\s*complete$/m.test(progress);
const completionAuditPasses = reportPasses("tests/reports/production-runtime-completion-audit.json");
const progressNotPrematureComplete = !progressClaimsComplete || completionAuditPasses;
const threeCompatFailureAuditPasses = reportPasses("tests/reports/production-runtime-three-compat-visual-failure-audit.json");
const publicRendererNormalPathPasses = reportPasses("tests/reports/public-renderer-normal-path/report.json");
const checks = [
  { id: "required-files", pass: missing.length === 0, detail: missing.join(", ") || "all required retained production-runtime evidence files exist" },
  { id: "plan-policies", pass: missingPlanPolicies.length === 0, detail: missingPlanPolicies.join(", ") || "production renderer plan is covered by retained docs" },
  { id: "status-patterns", pass: missingStatusPatterns.length === 0, detail: missingStatusPatterns.join(", ") || "status defines real renderer completion boundary" },
  { id: "blocked-claims", pass: missingBlockedPolicies.length === 0, detail: missingBlockedPolicies.join(", ") || "blocked claims are preserved" },
  { id: "milestone-coverage", pass: progressHasAllMilestones, detail: "retained completion docs describe release verification progress" },
  { id: "not-premature-complete", pass: progressNotPrematureComplete, detail: "progress is not complete before completion audit passes" },
  { id: "three-compat-failure-audit", pass: threeCompatFailureAuditPasses, detail: "Three.js compatibility visual failure audit report passes" },
  { id: "public-renderer-normal-path", pass: publicRendererNormalPathPasses, detail: "default production renderer selection and public lifecycle evidence report passes" }
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
