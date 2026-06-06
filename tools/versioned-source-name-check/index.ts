import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface VersionedSourceNameViolation {
  readonly path: string;
  readonly line?: number;
  readonly match: string;
  readonly rule: string;
  readonly message: string;
}

export interface VersionedSourceNameReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly scannedFiles: readonly string[];
  readonly excludedFiles: readonly string[];
  readonly violations: readonly VersionedSourceNameViolation[];
}

interface VersionedSourceNameOptions {
  readonly root?: string;
  readonly reportPath?: string;
}

const scanRoots = [
  "apps/aura-clash-showcase/src",
  "apps/aura-clash-showcase/tests",
  "apps/aura-clash-showcase/playable",
  "apps/aura-clash-showcase/evidence",
  "apps/aura-clash-showcase/launch-evidence",
  "apps/aura-clash-showcase/launch-evidence.manifest.json",
  "apps/aura-clash-showcase/aura.assets.json",
  "apps/aura-clash-showcase/public/aura-assets",
  "docs",
  "marketing",
  "README.md",
  "llms.txt"
] as const;

const allowedFiles = new Set([
  "docs/project/aura3d-106-game-engine-and-showcase-prd.md"
]);

const allowedPathFragments = [
  "/archive/",
  "/archived/",
  "/legacy-archive/",
  "/.vercel/"
] as const;

const textFileExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".xml"
]);

const forbiddenPatterns: readonly { readonly rule: string; readonly pattern: RegExp; readonly message: string }[] = [
  {
    rule: "versioned-game-directory",
    pattern: /\bgame-v[0-9]+\b/g,
    message: "Active Aura Clash implementation paths must use contextual names such as src/playable, not game-vN attempt names."
  },
  {
    rule: "versioned-aura-clash-symbol",
    pattern: /\bAuraClashV[0-9]+\b/g,
    message: "Active Aura Clash symbols must use contextual product names such as AuraClashArenaApp, not AuraClashVN."
  },
  {
    rule: "versioned-proof-object",
    pattern: /__AURA_CLASH_V[0-9]+_PROOF__/g,
    message: "Active browser proof objects must use contextual names such as __AURA_CLASH_ARENA_PROOF__."
  },
  {
    rule: "versioned-public-label",
    pattern: /\bAura Clash V[0-9]+\b/g,
    message: "Public product labels must use Aura Clash Arena, not Aura Clash VN attempt labels."
  },
  {
    rule: "versioned-playable-artifact",
    pattern: /\bplayable-[a-z0-9-]*v[0-9]+\b/gi,
    message: "Release artifacts must use contextual names such as aura-clash-arena-combat-frame, not playable-vN names."
  },
  {
    rule: "versioned-asset-name",
    pattern: /\b(?:assets\.)?v[0-9]+(?:UAL|[A-Z][a-z][A-Za-z0-9_]*)\b/g,
    message: "Release-facing typed assets and public asset files must use contextual names, not vN attempt names."
  }
];

export function validateVersionedSourceNames(options: VersionedSourceNameOptions = {}): VersionedSourceNameReport {
  const root = options.root ?? process.cwd();
  const files = collectFiles(root);
  const scannedFiles: string[] = [];
  const excludedFiles: string[] = [];
  const violations: VersionedSourceNameViolation[] = [];

  for (const path of files) {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)) {
      excludedFiles.push(path);
      continue;
    }
    if (shouldExclude(path)) {
      excludedFiles.push(path);
      continue;
    }
    scannedFiles.push(path);
    scanText(path, path, violations);
    if (isTextFile(path)) {
      const text = readFileSync(absolutePath, "utf8");
      scanText(path, text, violations);
    }
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    scannedFiles: scannedFiles.sort(),
    excludedFiles: excludedFiles.sort(),
    violations
  };
}

export function writeVersionedSourceNameReport(report: VersionedSourceNameReport, reportPath: string, root = process.cwd()): void {
  const absolute = join(root, reportPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function collectFiles(root: string): readonly string[] {
  const files: string[] = [];
  for (const scanRoot of scanRoots) {
    const absolute = join(root, scanRoot);
    if (!existsSync(absolute)) continue;
    const stat = statSync(absolute);
    if (stat.isFile()) {
      files.push(normalizePath(scanRoot));
      continue;
    }
    for (const file of walk(absolute)) {
      const relativePath = normalizePath(relative(root, file));
      files.push(relativePath);
    }
  }
  return [...new Set(files)].sort();
}

function walk(dir: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".vercel") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function scanText(path: string, text: string, violations: VersionedSourceNameViolation[]): void {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const forbidden of forbiddenPatterns) {
      forbidden.pattern.lastIndex = 0;
      for (const match of line.matchAll(forbidden.pattern)) {
        violations.push({
          path,
          line: index + 1,
          match: match[0] ?? "",
          rule: forbidden.rule,
          message: forbidden.message
        });
      }
    }
  }
}

function shouldExclude(path: string): boolean {
  if (allowedFiles.has(path)) return true;
  if (path.endsWith("package-lock.json") || path.endsWith("pnpm-lock.yaml") || path.endsWith("yarn.lock")) return true;
  return allowedPathFragments.some((fragment) => path.includes(fragment));
}

function isTextFile(path: string): boolean {
  const match = /\.[^.]+$/.exec(path);
  return Boolean(match && textFileExtensions.has(match[0]!.toLowerCase()));
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateVersionedSourceNames();
  const reportPath = readOption("--out");
  if (reportPath) {
    writeVersionedSourceNameReport(report, reportPath);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
