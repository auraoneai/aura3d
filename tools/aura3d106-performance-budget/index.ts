import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface Aura3D106PerformanceBudgetReport {
  readonly schema: "aura3d106-performance-budget";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly budgets: PerformanceBudgets;
  readonly measurements: PerformanceMeasurements;
  readonly evidencePaths: readonly string[];
  readonly gates: readonly PerformanceGate[];
  readonly blockers: readonly string[];
}

interface PerformanceBudgets {
  readonly maxFrameTimeMs: number;
  readonly minFps: number;
  readonly maxDrawCalls: number;
  readonly maxLargestJsBytes: number;
  readonly maxLargestCssBytes: number;
  readonly maxLargestGlbBytes: number;
  readonly maxTotalJsBytes: number;
  readonly maxTotalCssBytes: number;
  readonly maxTotalGlbBytes: number;
  readonly maxTotalRouteBytes: number;
}

interface PerformanceMeasurements {
  readonly largestJsBytes: number;
  readonly largestCssBytes: number;
  readonly largestGlbBytes: number;
  readonly totalJsBytes: number;
  readonly totalCssBytes: number;
  readonly totalGlbBytes: number;
  readonly totalRouteBytes: number;
  readonly distFileCount: number;
  readonly topAssets: readonly SizedAsset[];
}

interface SizedAsset {
  readonly path: string;
  readonly sizeBytes: number;
}

interface PerformanceGate {
  readonly id: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d106/performance-budget.json";
const budgets: PerformanceBudgets = {
  maxFrameTimeMs: 16.7,
  minFps: 55,
  maxDrawCalls: 160,
  maxLargestJsBytes: 1_250_000,
  maxLargestCssBytes: 96_000,
  maxLargestGlbBytes: 18_000_000,
  maxTotalJsBytes: 1_500_000,
  maxTotalCssBytes: 128_000,
  maxTotalGlbBytes: 70_000_000,
  maxTotalRouteBytes: 75_000_000
};

export function createAura3D106PerformanceBudgetReport(root = process.cwd()): Aura3D106PerformanceBudgetReport {
  const distRoot = join(root, "apps/aura-clash-showcase/dist");
  const measurements = measureDist(distRoot, root);
  const gates = [
    flagshipReportGate(root),
    sourceBudgetContractGate(root),
    distSizeGate(measurements)
  ];
  const blockers = gates.flatMap((gate) => gate.blockers.map((blocker) => `${gate.id}: ${blocker}`));
  const evidencePaths = [...new Set(gates.flatMap((gate) => gate.evidencePaths))].sort();
  return {
    schema: "aura3d106-performance-budget",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    budgets,
    measurements,
    evidencePaths,
    gates,
    blockers
  };
}

export function writeAura3D106PerformanceBudgetReport(
  root: string,
  report: Aura3D106PerformanceBudgetReport,
  outPath = defaultOutPath
): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function flagshipReportGate(root: string): PerformanceGate {
  const evidencePaths = [
    "apps/aura-clash-showcase/tests/reports/flagship-readiness.json",
    "apps/aura-clash-showcase/tests/reports/flagship-gates.json"
  ];
  const blockers: string[] = [];
  for (const path of evidencePaths) {
    const report = readJson(join(root, path));
    if (!report.exists) {
      blockers.push(`Missing flagship performance report ${path}. Run pnpm verify:aura-clash-flagship.`);
      continue;
    }
    if (report.json?.ok !== true) {
      blockers.push(`${path} is not ok.`);
    }
  }
  const flagshipText = readTextIfExists(root, "apps/aura-clash-showcase/tests/reports/flagship-gates.json");
  for (const token of ["flagship proof exposes performance and audio budgets instead of placeholders", "4 passed"]) {
    if (!flagshipText.includes(token)) blockers.push(`flagship-gates report does not include Playwright assertion evidence: ${token}`);
  }
  return {
    id: "flagship-playwright-performance-proof",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Flagship Playwright reports are green and include frame/fps/draw-call budget assertions."
      : "Flagship performance proof is missing or stale.",
    evidencePaths,
    blockers
  };
}

function sourceBudgetContractGate(root: string): PerformanceGate {
  const evidencePaths = [
    "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
    "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
  ];
  const blockers: string[] = [];
  const source = readTextIfExists(root, evidencePaths[0]!);
  const test = readTextIfExists(root, evidencePaths[1]!);
  for (const token of ["frameTimeMs", "fps", "drawCalls", "budgetOk"]) {
    if (!source.includes(token)) blockers.push(`Aura Clash proof source is missing performance field ${token}.`);
    if (!test.includes(token)) blockers.push(`Flagship Playwright source is missing performance assertion field ${token}.`);
  }
  if (!source.includes("Math.max(renderMs, dt * 1000)") || source.includes("Math.min(16.7")) {
    blockers.push("createPerformanceProof must publish unclamped frame timing; clamping to the budget ceiling hides regressions.");
  }
  for (const token of ["toBeLessThanOrEqual(16.7)", "toBeGreaterThanOrEqual(55)", "toBeLessThanOrEqual(160)"]) {
    if (!test.includes(token)) blockers.push(`Flagship Playwright source is missing threshold assertion ${token}.`);
  }
  return {
    id: "source-performance-budget-contract",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Aura Clash source publishes unclamped performance proof and Playwright enforces frame, FPS, and draw-call thresholds."
      : "Performance source/test contract is incomplete.",
    evidencePaths,
    blockers
  };
}

function distSizeGate(measurements: PerformanceMeasurements): PerformanceGate {
  const blockers: string[] = [];
  if (measurements.distFileCount === 0) blockers.push("Missing built Aura Clash dist files. Run pnpm --dir apps/aura-clash-showcase build.");
  if (measurements.largestJsBytes > budgets.maxLargestJsBytes) {
    blockers.push(`Largest JS chunk ${measurements.largestJsBytes} exceeds ${budgets.maxLargestJsBytes} bytes.`);
  }
  if (measurements.largestCssBytes > budgets.maxLargestCssBytes) {
    blockers.push(`Largest CSS file ${measurements.largestCssBytes} exceeds ${budgets.maxLargestCssBytes} bytes.`);
  }
  if (measurements.largestGlbBytes > budgets.maxLargestGlbBytes) {
    blockers.push(`Largest GLB ${measurements.largestGlbBytes} exceeds ${budgets.maxLargestGlbBytes} bytes.`);
  }
  if (measurements.totalJsBytes > budgets.maxTotalJsBytes) blockers.push(`Total JS ${measurements.totalJsBytes} exceeds ${budgets.maxTotalJsBytes} bytes.`);
  if (measurements.totalCssBytes > budgets.maxTotalCssBytes) blockers.push(`Total CSS ${measurements.totalCssBytes} exceeds ${budgets.maxTotalCssBytes} bytes.`);
  if (measurements.totalGlbBytes > budgets.maxTotalGlbBytes) blockers.push(`Total GLB ${measurements.totalGlbBytes} exceeds ${budgets.maxTotalGlbBytes} bytes.`);
  if (measurements.totalRouteBytes > budgets.maxTotalRouteBytes) {
    blockers.push(`Total route payload ${measurements.totalRouteBytes} exceeds ${budgets.maxTotalRouteBytes} bytes.`);
  }
  return {
    id: "built-route-asset-size-budgets",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Built Aura Clash JS, CSS, GLB, and total route payload sizes are inside the 1.0.6 budgets."
      : "Built Aura Clash route assets exceed one or more 1.0.6 budgets.",
    evidencePaths: ["apps/aura-clash-showcase/dist"],
    blockers
  };
}

function measureDist(distRoot: string, root: string): PerformanceMeasurements {
  const files = existsSync(distRoot) ? collectFiles(distRoot, root) : [];
  const js = files.filter((file) => file.path.endsWith(".js"));
  const css = files.filter((file) => file.path.endsWith(".css"));
  const glb = files.filter((file) => file.path.endsWith(".glb") || file.path.endsWith(".gltf"));
  const totals = (items: readonly SizedAsset[]) => items.reduce((sum, item) => sum + item.sizeBytes, 0);
  return {
    largestJsBytes: largest(js),
    largestCssBytes: largest(css),
    largestGlbBytes: largest(glb),
    totalJsBytes: totals(js),
    totalCssBytes: totals(css),
    totalGlbBytes: totals(glb),
    totalRouteBytes: totals(files.filter((file) => !file.path.endsWith(".map"))),
    distFileCount: files.length,
    topAssets: [...files].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 12)
  };
}

function collectFiles(dir: string, root: string): readonly SizedAsset[] {
  const files: SizedAsset[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute, root));
    } else if (entry.isFile()) {
      files.push({ path: normalizePath(relative(root, absolute)), sizeBytes: statSync(absolute).size });
    }
  }
  return files.filter((file) => extname(file.path));
}

function largest(items: readonly SizedAsset[]): number {
  return items.reduce((max, item) => Math.max(max, item.sizeBytes), 0);
}

function readJson(path: string): { readonly exists: boolean; readonly json?: { readonly ok?: unknown } } {
  if (!existsSync(path)) return { exists: false };
  return { exists: true, json: JSON.parse(readFileSync(path, "utf8")) as { readonly ok?: unknown } };
}

function readTextIfExists(root: string, path: string): string {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
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
  const root = process.cwd();
  const report = createAura3D106PerformanceBudgetReport(root);
  const outPath = readOption("--out") ?? defaultOutPath;
  writeAura3D106PerformanceBudgetReport(root, report, outPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
