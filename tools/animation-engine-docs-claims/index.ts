import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface AnimationEngineDocsClaimsReport {
  readonly schema: "animation-engine-docs-claims/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly scannedFiles: readonly string[];
  readonly blockers: readonly string[];
}

export interface AnimationEngineDocsClaimsOptions {
  readonly out?: string;
  readonly generatedAt?: string;
  readonly paths?: readonly string[];
}

const defaultOut = "tests/reports/animation-engine/docs-claims.json";
const defaultScanRoots = ["README.md", "llms.txt", "docs/animation", "docs/api", "docs/concepts", "marketing"];

// Animation-specific overclaims the engine must never make without an explicit fixture/non-goal qualifier nearby.
const forbiddenPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmotion[-\s]?matching\s+(?:engine|system|runtime|database|middleware)\b/i, "motion-matching engine claim"],
  [/\binertialization\b/i, "inertialization claim"],
  [/\bragdoll\s+(?:physics|system|simulation|controller)\b/i, "production ragdoll claim"],
  [/\bfull[-\s]?body\s+IK\b/i, "full-body IK claim"],
  [/\b(?:FABRIK|CCD)\s+(?:solver|IK)\b/i, "FABRIK/CCD solver claim"],
  [/\b(?:Unreal\s+)?Control\s+Rig\s+(?:parity|equivalent|compatible)\b/i, "Unreal Control Rig parity claim"],
  [/\b(?:Unity\s+)?(?:Mecanim|Animation\s+Rigging)\s+(?:parity|equivalent|compatible)\b/i, "Unity Mecanim/Animation Rigging parity claim"],
  [/\b(?:cloth|hair)\s+simulation\b/i, "cloth/hair simulation claim"],
  [/\bfoot[-\s]?lock(?:ing)?\s+(?:system|production)\b/i, "production foot-locking claim"]
];

export function createAnimationEngineDocsClaimsReport(root = process.cwd(), options: AnimationEngineDocsClaimsOptions = {}): AnimationEngineDocsClaimsReport {
  const scanPaths = options.paths ?? defaultScanRoots;
  const scannedFiles = listFiles(root, scanPaths).filter((path) => /\.(?:md|mdx|txt|html)$/.test(path));
  const blockers: string[] = [];
  for (const file of scannedFiles) {
    const text = readFileSync(join(root, file), "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const context = lines.slice(Math.max(0, index - 12), index + 1).join("\n");
      if (isAllowedNegativeContext(line, context)) continue;
      for (const [pattern, label] of forbiddenPatterns) {
        if (pattern.test(line)) blockers.push(`${file}:${index + 1} contains ${label}: ${line.trim()}`);
      }
    }
  }
  return {
    schema: "animation-engine-docs-claims/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    scannedFiles,
    blockers
  };
}

export function writeAnimationEngineDocsClaimsReport(root: string, report: AnimationEngineDocsClaimsReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function listFiles(root: string, paths: readonly string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const stat = statSync(absolute);
    if (stat.isFile()) {
      files.push(path);
      continue;
    }
    if (!stat.isDirectory()) continue;
    const entries = readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) files.push(...listFiles(root, [child]));
      if (entry.isFile()) files.push(child);
    }
  }
  return files.sort();
}

function isAllowedNegativeContext(line: string, context = line): boolean {
  const normalized = line.toLowerCase();
  if (/\b(must not|should not|cannot|can't|not|never|no|without|reject|rejected|fail|fails|failed|forbid|forbidden|non-goal|not a|not an|not be|fixture|deterministic telemetry|claimboundary|blockedclaims)\b/.test(normalized)) {
    return true;
  }
  if (/\b(boundary|limitation|limits|risk|anti-pattern|negative test|negative fixture|deferred|future work|out of scope)\b/.test(normalized)) return true;
  const normalizedContext = context.toLowerCase();
  if (/\b(blocked wording|blocked language|blocked unless|blocked .*claims|not allowed|must not be positioned|must not say|must not claim|do not claim|forbidden claims|fail criteria|non-goals?|fixture|claimboundary)\b/.test(normalizedContext)) {
    return true;
  }
  return false;
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (currentScript.endsWith("tools/animation-engine-docs-claims/index.ts") || currentScript.endsWith("tools/animation-engine-docs-claims/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationEngineDocsClaimsReport(root);
  writeAnimationEngineDocsClaimsReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`animation-engine docs-claims: OK (${report.scannedFiles.length} files scanned)`);
  }
}
