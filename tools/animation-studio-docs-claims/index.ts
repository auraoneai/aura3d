import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface AnimationStudioDocsClaimsReport {
  readonly schema: "animation-studio-docs-claims/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly scannedFiles: readonly string[];
  readonly blockers: readonly string[];
}

export interface AnimationStudioDocsClaimsOptions {
  readonly out?: string;
  readonly generatedAt?: string;
  readonly paths?: readonly string[];
}

const defaultOut = "tests/reports/aura3d11/animation-docs-claims.json";
const defaultScanRoots = ["README.md", "llms.txt", "docs", "marketing"];

const forbiddenPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bPixar(?:-|\s)?(?:quality|level|style|like|grade)\b/i, "Pixar-quality/Pixar-like claim"],
  [/\bproduction(?:-|\s)?quality\s+Pixar\b/i, "production-quality Pixar claim"],
  [/\bmagic(?:al)?\s+image(?:-|\s)?to(?:-|\s)?video\b/i, "magic image-to-video claim"],
  [/\bturn(?:s|ed|ing)?\s+(?:any\s+)?(?:2D\s+)?image\s+into\s+(?:a\s+)?(?:3D\s+)?(?:animation|episode|video)\b/i, "single-image-to-animation claim"],
  [/\bfull\s+(?:animation\s+)?studio\s+(?:replacement|platform)\b/i, "full studio replacement/platform claim"],
  [/\breplacement\s+for\s+(?:Blender|Maya|Toon Boom|After Effects|Unity|Unreal)\b/i, "DCC/engine replacement claim"],
  [/\bautomatic\s+YouTube\s+channel\b/i, "automatic YouTube channel claim"],
  [/\bimage-puppet\b.*\b(?:success|approved|publish-ready|release-ready|production-ready)\b/i, "image-puppet success claim"],
  [/\bnotTrue3D\b.*\b(?:success|approved|publish-ready|release-ready|production-ready)\b/i, "notTrue3D success claim"],
  [/\bsourceOnly\b.*\b(?:success|approved|publish-ready|release-ready|production-ready)\b/i, "sourceOnly success claim"]
];

export function createAnimationStudioDocsClaimsReport(root = process.cwd(), options: AnimationStudioDocsClaimsOptions = {}): AnimationStudioDocsClaimsReport {
  const scanPaths = options.paths ?? defaultScanRoots;
  const scannedFiles = listFiles(root, scanPaths).filter((path) => /\.(?:md|mdx|txt|html|ts|tsx|json)$/.test(path));
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
    schema: "animation-studio-docs-claims/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    scannedFiles,
    blockers
  };
}

export function writeAnimationStudioDocsClaimsReport(root: string, report: AnimationStudioDocsClaimsReport, out = defaultOut): void {
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
  if (/\b(must not|should not|cannot|can't|not|never|no|without|reject|rejected|fail|fails|failed|forbid|forbidden|non-goal|not a|not an|not be)\b/.test(normalized)) {
    return true;
  }
  if (/\b(boundary|limitation|limits|risk|anti-pattern|negative test|negative fixture)\b/.test(normalized)) return true;
  const normalizedContext = context.toLowerCase();
  if (/\b(blocked wording|blocked language|blocked unless|blocked .*claims|not allowed|must not be positioned|must not say|must not claim|do not claim|forbidden claims|rejected evidence|fail criteria|non-goals?)\b/.test(normalizedContext)) {
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
if (currentScript.endsWith("tools/animation-studio-docs-claims/index.ts") || currentScript.endsWith("tools/animation-studio-docs-claims/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationStudioDocsClaimsReport(root);
  writeAnimationStudioDocsClaimsReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
