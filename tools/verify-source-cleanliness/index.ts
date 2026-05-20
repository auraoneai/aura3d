import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface SourceCleanlinessViolation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly kind: "backup-file" | "source-copy-file" | "marker";
  readonly marker?: string;
  readonly message: string;
}

export interface SourceCleanlinessReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly checkedFiles: number;
  readonly checkedTextFiles: number;
  readonly scannedRoots: readonly string[];
  readonly violations: readonly SourceCleanlinessViolation[];
}

export interface SourceCleanlinessOptions {
  readonly roots?: readonly string[];
}

const defaultRoots = ["packages", "examples", "src"] as const;
const reportPaths = [
  "tests/reports/source-cleanliness.json",
  "tests/reports/final-source-cleanliness.json"
] as const;

const ignoredDirectoryNames = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "playwright-report",
  "test-results",
  "tests",
  "__fixtures__",
  "__tests__",
  "fixtures"
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".glsl",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".wgsl"
]);

const backupFilePattern = /(?:~$|\.bak$|\.backup$|\.old$|\.orig$|\.tmp$|\.swp$|\.swo$|\.save$|\.rej$)/i;
const sourceCopyFilePattern = /(?:^|[._ -])(?:copy|copied|backup)(?:[._ -]|\d|$)/i;

const markerPatterns: readonly (readonly [string, RegExp])[] = [
  ["TODO", /\bTODO\b/i],
  ["FIXME", /\bFIXME\b/i],
  ["stub", /\bstubs?\b|\bstubbed\b|\bstubbing\b/i],
  ["fake-success", /\bfake[-_\s]?success\b/i],
  ["incomplete", /\bincomplete\b/i]
];

function shouldSkipDirectory(name: string): boolean {
  return ignoredDirectoryNames.has(name);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (!shouldSkipDirectory(entry)) walkFiles(path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function isSourceCopyFile(fileName: string): boolean {
  if (!sourceCopyFilePattern.test(fileName)) return false;
  return textExtensions.has(extname(fileName).toLowerCase());
}

function isTextSourceFile(fileName: string): boolean {
  return textExtensions.has(extname(fileName).toLowerCase());
}

function hasIgnoredPathSegment(root: string, file: string): boolean {
  return relative(root, file)
    .split(sep)
    .some((part) => ignoredDirectoryNames.has(part));
}

function findMarker(source: string): { marker: string; index: number } | undefined {
  let earliest: { marker: string; index: number } | undefined;
  for (const [marker, pattern] of markerPatterns) {
    const match = pattern.exec(source);
    if (!match || match.index === undefined) continue;
    if (!earliest || match.index < earliest.index) earliest = { marker, index: match.index };
  }
  return earliest;
}

function lineColumnFor(source: string, index: number): { line: number; column: number } {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}

export function verifySourceCleanliness(root = process.cwd(), options: SourceCleanlinessOptions = {}): SourceCleanlinessReport {
  const configuredRoots = options.roots ?? defaultRoots;
  const scannedRoots = configuredRoots
    .map((entry) => join(root, entry))
    .filter((entry) => existsSync(entry));
  const files = scannedRoots.flatMap((entry) => walkFiles(entry));
  const violations: SourceCleanlinessViolation[] = [];
  let checkedTextFiles = 0;

  for (const file of files) {
    if (hasIgnoredPathSegment(root, file)) continue;

    const fileName = file.split(sep).at(-1) ?? file;
    if (backupFilePattern.test(fileName)) {
      violations.push({
        file,
        kind: "backup-file",
        message: "Backup files are forbidden in active source trees."
      });
      continue;
    }

    if (isSourceCopyFile(fileName)) {
      violations.push({
        file,
        kind: "source-copy-file",
        message: "Copied source files are forbidden in active source trees."
      });
      continue;
    }

    if (!isTextSourceFile(fileName)) continue;
    checkedTextFiles += 1;
    const source = readFileSync(file, "utf8");
    const marker = findMarker(source);
    if (marker) {
      const location = lineColumnFor(source, marker.index);
      violations.push({
        file,
        line: location.line,
        column: location.column,
        kind: "marker",
        marker: marker.marker,
        message: `Production source contains forbidden ${marker.marker} marker.`
      });
    }
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-source-cleanliness-run",
    checkedFiles: files.length,
    checkedTextFiles,
    scannedRoots: scannedRoots.map((entry) => relative(root, entry) || "."),
    violations
  };
}

function writeReport(root: string, report: SourceCleanlinessReport, paths: readonly string[] = reportPaths): void {
  for (const reportPath of paths) {
    const path = join(root, reportPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootIndex = process.argv.indexOf("--root");
  const rootsIndex = process.argv.indexOf("--roots");
  const reportPathsIndex = process.argv.indexOf("--report-paths");
  const root = rootIndex === -1 ? process.cwd() : (process.argv[rootIndex + 1] ?? process.cwd());
  const roots = rootsIndex === -1 ? undefined : process.argv[rootsIndex + 1]?.split(",").map((entry) => entry.trim()).filter(Boolean);
  const configuredReportPaths = reportPathsIndex === -1 ? undefined : process.argv[reportPathsIndex + 1]?.split(",").map((entry) => entry.trim()).filter(Boolean);
  const report = verifySourceCleanliness(root, roots === undefined ? {} : { roots });
  writeReport(root, report, configuredReportPaths);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Source cleanliness verification passed for ${report.checkedTextFiles} production text files.`);
  }
}
