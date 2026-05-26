import { existsSync } from "node:fs";
import { baseReport, readJson, writeJson } from "../foundation-reporting/index.js";

export interface FoundationEvidenceCheck {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly blocker: string;
}

export interface FoundationSubsystemReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly subsystem: string;
  readonly checks: readonly FoundationEvidenceCheck[];
}

export function createSubsystemReport(
  root: string,
  options: {
    readonly subsystem: string;
    readonly command: string;
    readonly reportPath: string;
    readonly runIdPrefix: string;
    readonly sourceFiles: readonly string[];
    readonly screenshotPaths?: readonly string[];
    readonly checks: readonly FoundationEvidenceCheck[];
  },
): FoundationSubsystemReport {
  const violations = options.checks.filter((check) => !check.passed).map((check) => check.blocker);
  const base = baseReport(root, {
    ok: violations.length === 0,
    command: options.command,
    runIdPrefix: options.runIdPrefix,
    sourceFiles: options.sourceFiles,
    screenshotPaths: options.screenshotPaths ?? [],
    violations,
  });
  const report = {
    ...base,
    subsystem: options.subsystem,
    checks: options.checks,
  };
  writeJson(root, options.reportPath, report);
  return report;
}

export function reportOk(root: string, path: string): boolean {
  return readJson(root, path)?.ok === true;
}

export function pathExists(root: string, path: string): boolean {
  return existsSync(`${root}/${path}`);
}

export function hasAnyFile(root: string, paths: readonly string[]): boolean {
  return paths.some((path) => pathExists(root, path));
}
