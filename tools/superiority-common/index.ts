import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type SuperiorityDecision = "exceeds" | "parity" | "partial" | "unsupported" | "unknown";
export type Severity = "info" | "warning" | "blocker";

export interface SuperiorityIssue {
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
}

export interface SuperiorityCategoryDecision {
  readonly category: string;
  readonly decision: SuperiorityDecision;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface SuperiorityReport {
  readonly schema: string;
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly decisions?: readonly SuperiorityCategoryDecision[];
  readonly issues: readonly SuperiorityIssue[];
  readonly evidence: readonly string[];
}

export interface ThreeJsParityInventoryReport {
  readonly totals?: {
    readonly examples?: number;
    readonly byStatus?: Record<string, number>;
  };
  readonly items?: readonly {
    readonly threeExampleId: string;
    readonly category: string;
    readonly priority: string;
    readonly a3dStatus: string;
    readonly visualStatus?: string;
    readonly sameSceneAvailable?: boolean;
    readonly blockingFeatures?: readonly string[];
  }[];
}

export function issue(id: string, message: string, severity: Severity = "blocker"): SuperiorityIssue {
  return { id, severity, message };
}

export function readJson<T = Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeReport(path: string, report: Omit<SuperiorityReport, "generatedAt">): SuperiorityReport {
  const fullReport = {
    ...report,
    generatedAt: new Date().toISOString()
  };
  writeJson(path, fullReport);
  console.log(`Superiority report written: ${path}`);
  if (!fullReport.pass && !process.argv.includes("--report-only")) {
    throw new Error(`${path} failed with ${fullReport.issues.length} issue(s).`);
  }
  return fullReport;
}

export function reportPasses(path: string): boolean {
  const report = readJson<{
    readonly pass?: unknown;
    readonly ok?: unknown;
    readonly status?: unknown;
    readonly assertions?: Record<string, unknown>;
  }>(path);
  if (!report) return false;
  if (report.pass === true || report.ok === true) return true;
  if (report.status === "ready" && report.assertions) {
    return Object.entries(report.assertions).every(([key, value]) => key === "fakeEqualityClaimed" ? value === false : value === true);
  }
  return false;
}

export function requirePassingReport(path: string, label: string): SuperiorityIssue[] {
  if (!fileExists(path)) return [issue(`missing:${path}`, `Missing ${label} report: ${path}.`)];
  if (!reportPasses(path)) return [issue(`failing:${path}`, `${label} report is not passing: ${path}.`)];
  return [];
}

export function readThreeJsParityInventory(path = "tests/reports/threejs-parity/threejs-inventory.json"): ThreeJsParityInventoryReport {
  const inventory = readJson<ThreeJsParityInventoryReport>(path);
  if (!inventory) {
    throw new Error(`Missing Three.js parity inventory report: ${path}. Run pnpm threejs-parity:inventory first.`);
  }
  return inventory;
}

export function decisionFromBlockers(blockers: readonly string[], passDecision: SuperiorityDecision = "parity"): SuperiorityDecision {
  return blockers.length === 0 ? passDecision : "partial";
}

export function categoriesPass(decisions: readonly SuperiorityCategoryDecision[]): boolean {
  return decisions.every((entry) => entry.decision === "parity" || entry.decision === "exceeds");
}

export function publicDocs(): readonly string[] {
  return [
    "README.md",
    "docs/project/current-state.md",
    "docs/project/competitive-positioning.md",
    "docs/project/go-to-market-strategy.md",
    "docs/project/threejs-superiority-status.md"
  ];
}
