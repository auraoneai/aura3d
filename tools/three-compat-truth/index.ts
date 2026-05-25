import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

interface Finding {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

const requiredFiles = [
  "docs/project/three-compat-roadmap-visual-engine-plan.md",
  "docs/project/three-compat-roadmap-status.md",
  "docs/project/three-compat-roadmap-progress.md",
  "docs/project/three-compat-roadmap-known-gaps.md",
  "docs/project/three-compat-roadmap-blocked-claims.md",
  "docs/project/three-compat-roadmap-visual-failures.md",
  "docs/project/three-compat-roadmap-legacy-prune-ledger.md"
] as const;

const blockedPatterns: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /\bfull three\.?js(?: api)? replacement\b/i, reason: "Full Three.js API replacement claim is blocked." },
  { pattern: /\bfull three\.?js ecosystem replacement\b/i, reason: "Full Three.js ecosystem replacement claim is blocked." },
  { pattern: /\bunity replacement\b/i, reason: "Unity replacement claim is blocked." },
  { pattern: /\bunreal replacement\b/i, reason: "Unreal replacement claim is blocked." },
  { pattern: /\bfull game engine replacement\b/i, reason: "Full game engine replacement claim is blocked." },
  { pattern: /\bfull webgpu parity\b/i, reason: "Full WebGPU parity claim is blocked." },
  { pattern: /\bbroad performance superiority\b/i, reason: "Broad performance superiority claim is blocked." },
  { pattern: /\bfull gltf ecosystem parity\b/i, reason: "Full glTF ecosystem parity claim is blocked." },
  { pattern: /\bfull commercial dcc pipeline parity\b/i, reason: "Full DCC pipeline parity claim is blocked." }
] as const;

const safeLinePatterns = [
  /\bblocked\b/i,
  /\bnot\b/i,
  /\bdoes not\b/i,
  /\bdo not\b/i,
  /\bunless\b/i,
  /\bclaim boundary\b/i,
  /\bblocked claims\b/i,
  /\bknown gaps\b/i,
  /\bremain visible\b/i,
  /\bout-of-scope\b/i,
  /\bpartial\b/i
] as const;

const publicDocRoots = [
  "README.md",
  "docs/project/three-compat-roadmap-visual-engine-plan.md",
  "docs/project"
] as const;

const missing = requiredFiles.filter((path) => !existsSync(resolve(path)));
const findings: Finding[] = [];

for (const path of publicMarkdownFiles(publicDocRoots)) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const blocked of blockedPatterns) {
      if (blocked.pattern.test(line) && !isSafeBlockedClaimContext(lines, index)) {
        findings.push({
          path: relative(process.cwd(), path),
          line: index + 1,
          text: line.trim(),
          reason: blocked.reason
        });
      }
    }
  });
}

const status = readIfExists("docs/project/three-compat-roadmap-status.md");
const progress = readIfExists("docs/project/three-compat-roadmap-progress.md");
const visualFailures = readIfExists("docs/project/three-compat-roadmap-visual-failures.md");
const threeCompat = readIfExists("docs/project/three-compat-roadmap-visual-engine-plan.md");
const requiredStatusPatterns = [
  /\bnot complete until\b[\s\S]*pnpm three-compat:release/i,
  /\bV4 completed a bounded V4 SDK\/product suite\b/i,
  /\bvisually undeniable\b/i
] as const;
const requiredPlanPatterns = [
  /\bLegacy Prune Contract\b/i,
  /\bThree\.js Baseline\b/i,
  /\bV5 Flagship Visual Bar\b/i,
  /\bBroad replacement gate must require\b/i
] as const;
const requiredFailurePaths = [
  "tests/reports/external-gallery/product/external-product-configurator.png",
  "tests/reports/external-gallery/materials/external-material-studio.png",
  "tests/reports/external-gallery/assets/external-asset-gallery.png",
  "tests/reports/external-gallery/performance/large-scene-performance.png"
] as const;
const missingStatusPhrases = requiredStatusPatterns.filter((pattern) => !pattern.test(status)).map(String);
const missingPlanPhrases = requiredPlanPatterns.filter((pattern) => !pattern.test(threeCompat)).map(String);
const missingFailureReferences = requiredFailurePaths.filter((path) => !visualFailures.includes(path));
const progressHasAllMilestones = Array.from({ length: 21 }, (_, index) => `Milestone ${index}`).every((milestone) => progress.includes(milestone));
const progressClaimsComplete = /^Current status:\s*complete$/m.test(progress);
const completionAuditPasses = reportPasses("tests/reports/three-compat-completion-audit.json");
const progressDoesNotClaimComplete = !progressClaimsComplete || completionAuditPasses;

const report = {
  schema: "g3d-three-compat-truth/v1",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0
    && findings.length === 0
    && missingStatusPhrases.length === 0
    && missingPlanPhrases.length === 0
    && missingFailureReferences.length === 0
    && progressHasAllMilestones
    && progressDoesNotClaimComplete,
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  missing,
  findings,
  missingStatusPhrases,
  missingPlanPhrases,
  missingFailureReferences,
  progressHasAllMilestones,
  progressDoesNotClaimComplete,
  progressClaimsComplete,
  completionAuditPasses,
  blockedClaimsRemainBlocked: true
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/three-compat-truth.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function readIfExists(path: string): string {
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

function isSafeBlockedClaimContext(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (safeLinePatterns.some((safe) => safe.test(line))) return true;
  const previousHeading = nearestHeading(lines, index);
  return /\bblocked\b/i.test(previousHeading) || /\bclaim boundary\b/i.test(previousHeading) || /\bknown gaps\b/i.test(previousHeading);
}

function nearestHeading(lines: readonly string[], index: number): string {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? "";
    if (/^#{1,6}\s+/.test(line)) return line;
  }
  return "";
}

function publicMarkdownFiles(roots: readonly string[]): string[] {
  const files: string[] = [];
  for (const root of roots) {
    const full = resolve(root);
    if (!existsSync(full)) continue;
    if (statSync(full).isFile()) {
      if (extname(full) === ".md") files.push(full);
      continue;
    }
    files.push(...walk(full).filter((path) => extname(path) === ".md"));
  }
  return files;
}

function walk(dir: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}
