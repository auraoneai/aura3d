import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

interface Finding {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

const requiredFiles = [
  "docs/project/v3-roadmap-product-workflow-plan.md",
  "docs/project/v3-roadmap-status.md",
  "docs/project/v3-roadmap-progress.md",
  "docs/project/v3-roadmap-blocked-claims.md"
] as const;

const blockedPatterns: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /\bunity replacement\b/i, reason: "Unity replacement claim is blocked." },
  { pattern: /\bunreal replacement\b/i, reason: "Unreal replacement claim is blocked." },
  { pattern: /\bfull game engine replacement\b/i, reason: "Full game engine replacement claim is blocked." },
  { pattern: /\bfull three\.?js(?: api)? replacement\b/i, reason: "Full Three.js replacement claim is blocked." },
  { pattern: /\bbroad three\.?js replacement\b/i, reason: "Broad Three.js replacement claim is blocked." },
  { pattern: /\bfull gltf parity\b/i, reason: "Full glTF parity claim is blocked." },
  { pattern: /\bfull webgpu parity\b/i, reason: "Full WebGPU parity claim is blocked." },
  { pattern: /\bbroadly (?:faster|superior) than three\.?js\b/i, reason: "Broad Three.js superiority claim is blocked." }
];

const safeLinePatterns = [
  /\bnot\b/i,
  /\bblocked\b/i,
  /\bdisallowed\b/i,
  /\bdo not\b/i,
  /\bcannot\b/i,
  /\buntil\b/i,
  /\btarget\b/i,
  /\bbuilding toward\b/i,
  /\bfuture\b/i,
  /\bclaim is blocked\b/i,
  /\ballowed only after\b/i
] as const;

const publicDocRoots = [
  "README.md",
  "docs/api",
  "docs/tutorials",
  "docs/project/v3-roadmap-status.md",
  "docs/project/v3-roadmap-product-positioning.md",
  "docs/project/v3-roadmap-threejs-competitor-status.md",
  "docs/project/v3-roadmap-supported-workflows.md",
  "docs/project/v3-roadmap-known-gaps.md"
] as const;
const missing = requiredFiles.filter((path) => !existsSync(resolve(path)));
const findings: Finding[] = [];

for (const path of publicMarkdownFiles(publicDocRoots)) {
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const blocked of blockedPatterns) {
      if (blocked.pattern.test(line) && !safeLinePatterns.some((safe) => safe.test(line))) {
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

const status = existsSync(resolve("docs/project/v3-roadmap-status.md"))
  ? readFileSync(resolve("docs/project/v3-roadmap-status.md"), "utf8")
  : "";
const progress = existsSync(resolve("docs/project/v3-roadmap-progress.md"))
  ? readFileSync(resolve("docs/project/v3-roadmap-progress.md"), "utf8")
  : "";

const requiredStatusPatterns = [
  /\bnot\W+currently\W+a\W+Unity\W+replacement\b/i,
  /\bnot\W+complete\W+until\W+`pnpm v3:release`\W+passes\b/i
] as const;
const missingStatusPhrases = requiredStatusPatterns
  .filter((pattern) => !pattern.test(status))
  .map((pattern) => String(pattern));
const progressHasReleaseGate = progress.includes("Milestone 10 - Release Gates")
  && (progress.includes("Current status: in-progress") || progress.includes("Current status: complete"));

const report = {
  schema: "a3d-foundation-truth/v1",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0 && findings.length === 0 && missingStatusPhrases.length === 0 && progressHasReleaseGate,
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  missing,
  findings,
  missingStatusPhrases,
  progressHasReleaseGate,
  blockedClaimsRemainBlocked: true
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/foundation-truth.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exitCode = 1;
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
    for (const entry of walk(full)) {
      if (extname(entry) === ".md") files.push(entry);
    }
  }
  return files;
}

function walk(dir: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      output.push(...walk(path));
    } else {
      output.push(path);
    }
  }
  return output;
}
