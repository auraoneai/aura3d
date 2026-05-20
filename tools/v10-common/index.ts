import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type V10Decision = "exceeds" | "parity" | "partial" | "unsupported" | "unknown";
export type Severity = "info" | "warning" | "blocker";

export interface V10Issue {
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
}

export interface V10CategoryDecision {
  readonly category: string;
  readonly decision: V10Decision;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface V10Report {
  readonly schema: string;
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly decisions?: readonly V10CategoryDecision[];
  readonly issues: readonly V10Issue[];
  readonly evidence: readonly string[];
}

export interface V9InventoryReport {
  readonly totals?: {
    readonly examples?: number;
    readonly byStatus?: Record<string, number>;
  };
  readonly items?: readonly {
    readonly threeExampleId: string;
    readonly category: string;
    readonly priority: string;
    readonly g3dStatus: string;
    readonly visualStatus?: string;
    readonly sameSceneAvailable?: boolean;
    readonly blockingFeatures?: readonly string[];
  }[];
}

export function issue(id: string, message: string, severity: Severity = "blocker"): V10Issue {
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

export function writeReport(path: string, report: Omit<V10Report, "generatedAt">): V10Report {
  const fullReport = {
    ...report,
    generatedAt: new Date().toISOString()
  };
  writeJson(path, fullReport);
  console.log(`V10 report written: ${path}`);
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

export function requirePassingReport(path: string, label: string): V10Issue[] {
  if (!fileExists(path)) return [issue(`missing:${path}`, `Missing ${label} report: ${path}.`)];
  if (!reportPasses(path)) return [issue(`failing:${path}`, `${label} report is not passing: ${path}.`)];
  return [];
}

export function readV9Inventory(path = "tests/reports/v9/threejs-inventory.json"): V9InventoryReport {
  const inventory = readJson<V9InventoryReport>(path);
  if (!inventory) {
    throw new Error(`Missing V9 inventory report: ${path}. Run pnpm v9:inventory first.`);
  }
  return inventory;
}

export function decisionFromBlockers(blockers: readonly string[], passDecision: V10Decision = "parity"): V10Decision {
  return blockers.length === 0 ? passDecision : "partial";
}

export function categoriesPass(decisions: readonly V10CategoryDecision[]): boolean {
  return decisions.every((entry) => entry.decision === "parity" || entry.decision === "exceeds");
}

export function publicDocs(): readonly string[] {
  return [
    "README.md",
    "docs/project/current-state.md",
    "docs/project/competitive-positioning.md",
    "docs/project/go-to-market-strategy.md",
    "docs/project/v10-superiority-status.md"
  ];
}
