/**
 * C-39 `aura3d perf-report` (PRD-09): replaces the per-route
 * `write-performance-report.ts` scripts. Consumes the telemetry JSON emitted
 * by a migrated route's `perf` evidence section (rAF frame intervals —
 * never an engine fps counter), then writes/prints the report.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { AuraCliCommand } from "../../contracts/commands.js";

interface TelemetryPerf {
  /** rAF frame intervals in milliseconds. */
  readonly frameIntervals?: readonly number[];
  readonly samples?: readonly number[];
}

interface Telemetry {
  readonly route?: string;
  readonly generatedAt?: string;
  readonly perf?: TelemetryPerf | readonly number[];
  readonly [key: string]: unknown;
}

interface PerfReport {
  route: string;
  generatedAt: string;
  producer: string;
  perf: {
    samples: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    meanMs: number;
    /** Estimated fps derived from interval statistics, not an engine counter. */
    estFps: number;
    jankFrames: number; // intervals > 2x p50
    budget: { p95Ms: number; pass: boolean };
  };
}

const P95_BUDGET_MS = 16.7; // 60 fps frame budget

function intervalsOf(perf: TelemetryPerf | readonly number[] | undefined): number[] {
  const raw = Array.isArray(perf) ? perf : perf?.frameIntervals ?? perf?.samples ?? [];
  return raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
}

function percentile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[i];
}

export function buildPerfReport(route: string, telemetry: Telemetry): PerfReport {
  const intervals = intervalsOf(telemetry.perf).sort((a, b) => a - b);
  const p50 = percentile(intervals, 0.5);
  const p95 = percentile(intervals, 0.95);
  const p99 = percentile(intervals, 0.99);
  const mean = intervals.reduce((a, b) => a + b, 0) / (intervals.length || 1);
  return {
    route,
    generatedAt: new Date().toISOString(),
    producer: "aura3d perf-report",
    perf: {
      samples: intervals.length,
      p50Ms: +p50.toFixed(3),
      p95Ms: +p95.toFixed(3),
      p99Ms: +p99.toFixed(3),
      meanMs: +mean.toFixed(3),
      estFps: p50 > 0 ? +(1000 / p50).toFixed(1) : 0,
      jankFrames: intervals.filter((v) => v > p50 * 2).length,
      budget: { p95Ms: P95_BUDGET_MS, pass: p95 <= P95_BUDGET_MS }
    }
  };
}

export const perfReportCommand: AuraCliCommand = {
  name: "perf-report",
  owner: "prd09",
  summary: "Build a route performance report from a perf-evidence telemetry JSON (rAF intervals).",
  usage: "aura3d perf-report --route <id> --telemetry <telemetry.json> [--out performance-report.json]",
  async run(argv, io) {
    const arg = (flag: string): string | undefined => {
      const i = argv.indexOf(flag);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    const route = arg("--route");
    const telemetryPath = arg("--telemetry");
    if (!route || !telemetryPath) {
      io.stderr(`usage: ${perfReportCommand.usage}`);
      return 2;
    }
    let telemetry: Telemetry;
    try {
      telemetry = JSON.parse(readFileSync(resolve(io.cwd, telemetryPath), "utf8")) as Telemetry;
    } catch (error) {
      io.stderr(`perf-report: cannot read ${telemetryPath}: ${String(error)}`);
      return 2;
    }
    const report = buildPerfReport(route, telemetry);
    const out = arg("--out") ?? `apps/${route}/performance-report.json`;
    const target = resolve(io.cwd, out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    io.stdout(`perf-report ${route}: samples=${report.perf.samples} p50=${report.perf.p50Ms}ms p95=${report.perf.p95Ms}ms estFps=${report.perf.estFps} jank=${report.perf.jankFrames} budget=${report.perf.budget.pass ? "pass" : "FAIL"}`);
    io.stdout(`wrote ${out}`);
    return report.perf.budget.pass ? 0 : 1;
  }
};
