import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface V3SourceFileHash {
  readonly path: string;
  readonly sha256: string;
}

export interface V3ReportBase {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly V3SourceFileHash[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
}

export interface V3FreshnessIssue {
  readonly path: string;
  readonly message: string;
}

export const v3ReportPaths = [
  "tests/reports/v3-current-capability.json",
  "tests/reports/v3-example-screenshots/manifest.json",
  "tests/reports/v3-rendering.json",
  "tests/reports/v3-asset-corpus.json",
  "tests/reports/v3-editor-authoring.json",
  "tests/reports/v3-runtime-systems.json",
  "tests/reports/v3-engine-comparison.json",
  "tests/reports/v3-flake-detection.json",
  "tests/reports/v3-claim-gates.json",
] as const;

export const blockedV3Claims = [
  "broad better-than-Three.js language",
  "Unity/Unreal replacement language",
  "production-ready language",
  "PBR parity language",
  "full WebGPU language",
  "complete glTF support language",
  "production texture-compression language",
  "real editor language before editor workflow passes",
] as const;

export function currentCommit(root = process.cwd()): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function createRunId(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashFile(root: string, path: string): V3SourceFileHash {
  return {
    path,
    sha256: hashText(readFileSync(join(root, path), "utf8")),
  };
}

export function hashExistingFiles(root: string, paths: readonly string[]): readonly V3SourceFileHash[] {
  return paths
    .filter((path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile())
    .map((path) => hashFile(root, path));
}

export function writeJson(root: string, reportPath: string, value: unknown): void {
  const absolutePath = join(root, reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(root: string, reportPath: string): Record<string, unknown> | null {
  const absolutePath = join(root, reportPath);
  if (!existsSync(absolutePath)) return null;
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : null;
}

export function baseReport(
  root: string,
  options: {
    readonly ok: boolean;
    readonly command: string;
    readonly runIdPrefix: string;
    readonly sourceFiles: readonly string[];
    readonly blockedClaims?: readonly string[];
    readonly screenshotPaths?: readonly string[];
    readonly violations?: readonly string[];
  },
): V3ReportBase {
  return {
    ok: options.ok,
    generatedAt: new Date().toISOString(),
    commit: currentCommit(root),
    runId: createRunId(options.runIdPrefix),
    command: options.command,
    sourceFileHashes: hashExistingFiles(root, options.sourceFiles),
    blockedClaims: [...(options.blockedClaims ?? blockedV3Claims)],
    screenshotPaths: [...(options.screenshotPaths ?? [])],
    violations: [...(options.violations ?? [])],
  };
}

export function listFiles(root: string, startsWith: readonly string[], extensions: readonly string[]): readonly string[] {
  const output: string[] = [];
  const extensionSet = new Set(extensions);
  for (const start of startsWith) {
    const absoluteStart = join(root, start);
    if (!existsSync(absoluteStart)) continue;
    visit(absoluteStart);
  }
  return output.map((path) => normalizePath(relative(root, path))).sort((left, right) => left.localeCompare(right));

  function visit(path: string): void {
    const stats = statSync(path);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if ([".git", "node_modules", "dist", "tests/reports", "test-results", "playwright-report"].includes(entry)) continue;
        visit(join(path, entry));
      }
      return;
    }
    if (!stats.isFile()) return;
    if ([...extensionSet].some((extension) => path.endsWith(extension))) {
      output.push(path);
    }
  }
}

export function validateV3ReportFreshness(root = process.cwd(), paths: readonly string[] = v3ReportPaths): readonly V3FreshnessIssue[] {
  const commit = currentCommit(root);
  const issues: V3FreshnessIssue[] = [];
  for (const reportPath of paths) {
    const report = readJson(root, reportPath);
    if (!report) {
      issues.push({ path: reportPath, message: "Missing v3 report." });
      continue;
    }
    if (report.commit !== commit) {
      issues.push({ path: reportPath, message: `Report commit ${String(report.commit)} does not match current commit ${commit}.` });
    }
    if (typeof report.generatedAt !== "string" || Number.isNaN(Date.parse(report.generatedAt))) {
      issues.push({ path: reportPath, message: "Report is missing a valid generatedAt timestamp." });
    }
    if (typeof report.runId !== "string" || report.runId.length === 0) {
      issues.push({ path: reportPath, message: "Report is missing runId." });
    }
    if (typeof report.command !== "string" || report.command.length === 0) {
      issues.push({ path: reportPath, message: "Report is missing command." });
    }
    if (typeof report.ok !== "boolean") {
      issues.push({ path: reportPath, message: "Report is missing boolean ok field." });
    }
    if (!Array.isArray(report.blockedClaims)) {
      issues.push({ path: reportPath, message: "Report is missing blockedClaims array." });
    }
    if (!Array.isArray(report.screenshotPaths)) {
      issues.push({ path: reportPath, message: "Report is missing screenshotPaths array." });
    }
    if (!Array.isArray(report.sourceFileHashes) || report.sourceFileHashes.length === 0) {
      issues.push({ path: reportPath, message: "Report is missing sourceFileHashes freshness markers." });
      continue;
    }
    for (const entry of report.sourceFileHashes) {
      if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
        issues.push({ path: reportPath, message: "Report has a malformed sourceFileHashes entry." });
        continue;
      }
      const sourcePath = join(root, entry.path);
      if (!existsSync(sourcePath)) {
        issues.push({ path: reportPath, message: `Freshness source is missing: ${entry.path}.` });
        continue;
      }
      const currentHash = hashFile(root, entry.path).sha256;
      if (currentHash !== entry.sha256) {
        issues.push({ path: reportPath, message: `Freshness source changed after report generation: ${entry.path}.` });
      }
    }
  }
  return issues;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
