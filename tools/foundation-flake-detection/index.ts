import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, hashText, readJson, writeJson } from "../foundation-reporting/index.js";

type FlakeTarget = {
  readonly id: string;
  readonly command: readonly string[];
  readonly reportPath: string;
  readonly stableSignature: (report: Record<string, unknown>) => unknown;
};

const root = process.cwd();

const targets: readonly FlakeTarget[] = [
  {
    id: "browser-visual-examples",
    command: ["pnpm", "--silent", "verify:foundation-examples"],
    reportPath: "tests/reports/foundation-example-screenshots/manifest.json",
    stableSignature: (report) => {
      const entries = Array.isArray(report.entries) ? report.entries : [];
      return {
        ok: report.ok,
        screenshotCount: Array.isArray(report.screenshotPaths) ? report.screenshotPaths.length : 0,
        entries: entries.map((entry) => isRecord(entry) ? {
          id: entry.id,
          runtimeStateKey: entry.runtimeStateKey,
          runtimeStatus: entry.runtimeStatus,
          renderer: entry.renderer,
          diagnosticsPresent: entry.diagnosticsPresent,
          errorsPresent: entry.errorsPresent,
          visualClaim: entry.visualClaim,
          knownLimitsCount: entry.knownLimitsCount,
        } : entry),
      };
    },
  },
  {
    id: "benchmark-comparison",
    command: ["pnpm", "--silent", "verify:foundation-benchmarks"],
    reportPath: "tests/reports/foundation-engine-comparison.json",
    stableSignature: (report) => {
      const scenes = Array.isArray(report.scenes) ? report.scenes : [];
      const supportedNicheClaims = Array.isArray(report.supportedNicheClaims) ? report.supportedNicheClaims : [];
      return {
        ok: report.ok,
        claimUsable: report.claimUsable,
        comparedEngines: report.comparedEngines,
        sceneIds: scenes.map((scene) => isRecord(scene) ? scene.id : scene),
        supportedNicheClaims: supportedNicheClaims.map((claim) => isRecord(claim) ? {
          id: claim.id,
          status: claim.status,
          comparedEngine: claim.comparedEngine,
          measuredDimension: claim.measuredDimension,
        } : claim),
      };
    },
  },
];

export function runFoundationFlakeDetection(iterations = 2): number {
  const targetResults = targets.map((target) => runTarget(target, iterations));
  const violations = targetResults.flatMap((target) => target.violations.map((violation) => `${target.id}: ${violation}`));
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:foundation-flakes",
      runIdPrefix: "foundation-flake-detection",
      sourceFiles: [
        "package.json",
        "tools/foundation-flake-detection/index.ts",
        "tests/browser/example-screenshot-audit.spec.ts",
        "tests/browser/engine-comparison.spec.ts",
        "tools/compare-engines/index.ts",
        "tools/example-truth-audit/index.ts",
      ],
      screenshotPaths: collectScreenshotPaths(),
      violations,
    }),
    iterations,
    targets: targetResults,
  };
  writeJson(root, "tests/reports/foundation-flake-detection.json", report);
  console.log(JSON.stringify({ ok: report.ok, targets: targetResults.length, violations: violations.length }, null, 2));
  return report.ok ? 0 : 1;
}

function runTarget(target: FlakeTarget, iterations: number): {
  readonly id: string;
  readonly reportPath: string;
  readonly command: readonly string[];
  readonly iterations: readonly {
    readonly index: number;
    readonly exitCode: number;
    readonly durationMs: number;
    readonly reportHash: string | null;
  }[];
  readonly stableReportHash: string | null;
  readonly violations: readonly string[];
} {
  const runs = [];
  const signatures: string[] = [];
  const violations: string[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const [command, ...args] = target.command;
    const result = spawnSync(command!, args, { cwd: root, stdio: "inherit", env: process.env });
    const durationMs = Number((performance.now() - started).toFixed(1));
    const exitCode = result.status ?? 1;
    const report = readJson(root, target.reportPath);
    const signature = report ? stableStringify(target.stableSignature(report)) : null;
    const reportHash = signature ? hashText(signature) : null;
    if (exitCode !== 0) violations.push(`iteration ${index + 1} exited ${exitCode}`);
    if (!report) violations.push(`iteration ${index + 1} did not write ${target.reportPath}`);
    if (signature) signatures.push(signature);
    runs.push({ index: index + 1, exitCode, durationMs, reportHash });
  }

  const firstSignature = signatures[0] ?? null;
  for (const [index, signature] of signatures.entries()) {
    if (firstSignature !== null && signature !== firstSignature) {
      violations.push(`stable report signature changed between iteration 1 and ${index + 1}`);
    }
  }

  return {
    id: target.id,
    reportPath: target.reportPath,
    command: target.command,
    iterations: runs,
    stableReportHash: firstSignature ? hashText(firstSignature) : null,
    violations,
  };
}

function collectScreenshotPaths(): readonly string[] {
  const manifest = readJson(root, "tests/reports/foundation-example-screenshots/manifest.json");
  if (manifest && Array.isArray(manifest.screenshotPaths)) {
    return manifest.screenshotPaths.filter((path): path is string => typeof path === "string");
  }
  return [];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortValue(entry)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runFoundationFlakeDetection();
}
