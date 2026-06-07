import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Cartoon Studio PRD Phase 4 "video-render performance budget gate".
 *
 * Reads a render manifest (standard package, `render-manifest.json`) and/or a
 * live-3D render summary (`render-live-summary.json`) and asserts a documented
 * performance budget. Emits a machine-readable report and exits nonzero on any
 * breach so it can run as a CI gate.
 *
 * Additive only: this tool reads existing render outputs; it never mutates them.
 */

// ---------------------------------------------------------------------------
// Budget constants (documented). Each ceiling is intentionally generous enough
// for the template's deterministic vector/3D render but tight enough to catch a
// regression that would bloat encode size, draw calls, or break frame timing.
// ---------------------------------------------------------------------------

/**
 * Max encoded video bytes per second of runtime. A 60s episode at the template
 * VP9 settings encodes to ~2.48 MB (~41 KB/s). 250 KB/s leaves head-room for
 * busier scenes while flagging an order-of-magnitude bitrate regression.
 */
const MAX_ENCODED_BYTES_PER_SECOND = 250_000;

/**
 * Max total encoded video size for a single episode (bytes). 64 MB is a hard
 * upload-friendly ceiling that the 2.48 MB template output sits far under, but
 * which catches a runaway encode (e.g. raw/uncompressed frames slipping in).
 */
const MAX_TOTAL_ENCODED_BYTES = 64 * 1024 * 1024;

/**
 * Max GPU draw calls per rendered frame. The live-3D path issues 38 draw calls
 * for the two-character moon-garden scene; 120 leaves room for additional props
 * while flagging an unbatched-geometry regression.
 */
const MAX_DRAW_CALLS_PER_FRAME = 120;

/**
 * Allowed fractional tolerance when checking frameCount == duration * fps.
 * Encoders may drop or pad a frame at boundaries; 1% (and at least 1 frame)
 * absorbs that without hiding a real timing drift.
 */
const FRAME_COUNT_TOLERANCE_FRACTION = 0.01;

/** Minimum target output resolution: 720p (1280x720). */
const MIN_OUTPUT_WIDTH = 1280;
const MIN_OUTPUT_HEIGHT = 720;

const defaultManifestPath =
  "packages/create-aura3d/templates/cartoon-studio/dist/episodes/moon-garden-001/render-manifest.json";
const defaultSummaryPath =
  "packages/create-aura3d/templates/cartoon-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/aura3d11/cartoon-performance-budget.json";

export interface PerformanceBudgetMetric {
  readonly id: string;
  readonly label: string;
  readonly source: "render-manifest" | "render-live-summary";
  /** Measured value (number) or null when the input did not provide it. */
  readonly value: number | null;
  /** Numeric budget the metric is compared against. */
  readonly budget: number;
  /** Comparison performed: measured value must satisfy this relative to budget. */
  readonly comparison: "<=" | ">=" | "approx==";
  readonly unit: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PerformanceBudgetReport {
  readonly schema: "cartoon-studio-performance-budget/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly inputs: {
    readonly manifestPath: string | null;
    readonly summaryPath: string | null;
  };
  readonly budgets: {
    readonly maxEncodedBytesPerSecond: number;
    readonly maxTotalEncodedBytes: number;
    readonly maxDrawCallsPerFrame: number;
    readonly frameCountToleranceFraction: number;
    readonly minOutputWidth: number;
    readonly minOutputHeight: number;
  };
  readonly metrics: readonly PerformanceBudgetMetric[];
  readonly breaches: readonly string[];
}

export interface PerformanceBudgetOptions {
  readonly manifestPath?: string | null;
  readonly summaryPath?: string | null;
  readonly out?: string;
  readonly generatedAt?: string;
}

interface ParsedManifest {
  readonly duration: number | null;
  readonly frameRate: number | null;
  readonly encodedFrameCount: number | null;
  readonly encodedBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

interface ParsedSummary {
  readonly frameRate: number | null;
  readonly videoBytes: number | null;
  readonly maxDrawCalls: number | null;
  readonly seekProofCount: number;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readJson(absolutePath: string): unknown {
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function parseManifest(raw: unknown): ParsedManifest {
  const record = (raw ?? {}) as Record<string, unknown>;
  const encodedVideo = (record.encodedVideo ?? {}) as Record<string, unknown>;
  const resolution = (record.resolution ?? {}) as Record<string, unknown>;
  return {
    duration: toNumber(record.duration),
    frameRate: toNumber(record.frameRate),
    encodedFrameCount: toNumber(encodedVideo.encodedFrameCount),
    encodedBytes: toNumber(encodedVideo.byteLength),
    width: toNumber(resolution.width),
    height: toNumber(resolution.height)
  };
}

export function parseSummary(raw: unknown): ParsedSummary {
  const record = (raw ?? {}) as Record<string, unknown>;
  const seekProofs = Array.isArray(record.seekProofs) ? record.seekProofs : [];
  let maxDrawCalls: number | null = null;
  for (const proof of seekProofs) {
    const drawCalls = toNumber((proof as Record<string, unknown>)?.drawCalls);
    if (drawCalls === null) continue;
    maxDrawCalls = maxDrawCalls === null ? drawCalls : Math.max(maxDrawCalls, drawCalls);
  }
  return {
    frameRate: toNumber(record.frameRate),
    videoBytes: toNumber(record.videoBytes),
    maxDrawCalls,
    seekProofCount: seekProofs.length
  };
}

function metricLte(
  id: string,
  label: string,
  source: PerformanceBudgetMetric["source"],
  value: number | null,
  budget: number,
  unit: string
): PerformanceBudgetMetric {
  const ok = value !== null && value <= budget;
  return {
    id,
    label,
    source,
    value,
    budget,
    comparison: "<=",
    unit,
    ok,
    detail:
      value === null
        ? `${label} missing from input; cannot verify <= ${budget} ${unit}.`
        : ok
          ? `${label} ${value} ${unit} within budget ${budget} ${unit}.`
          : `${label} ${value} ${unit} exceeds budget ${budget} ${unit}.`
  };
}

function metricGte(
  id: string,
  label: string,
  source: PerformanceBudgetMetric["source"],
  value: number | null,
  budget: number,
  unit: string
): PerformanceBudgetMetric {
  const ok = value !== null && value >= budget;
  return {
    id,
    label,
    source,
    value,
    budget,
    comparison: ">=",
    unit,
    ok,
    detail:
      value === null
        ? `${label} missing from input; cannot verify >= ${budget} ${unit}.`
        : ok
          ? `${label} ${value} ${unit} meets minimum ${budget} ${unit}.`
          : `${label} ${value} ${unit} below minimum ${budget} ${unit}.`
  };
}

export function createPerformanceBudgetReport(
  root = process.cwd(),
  options: PerformanceBudgetOptions = {}
): PerformanceBudgetReport {
  const manifestRel =
    options.manifestPath === null ? null : options.manifestPath ?? defaultManifestPath;
  const summaryRel = options.summaryPath === null ? null : options.summaryPath ?? defaultSummaryPath;

  const metrics: PerformanceBudgetMetric[] = [];

  // ---- Standard render manifest metrics --------------------------------
  let resolvedManifestPath: string | null = null;
  if (manifestRel) {
    const absolute = join(root, manifestRel);
    if (existsSync(absolute)) {
      resolvedManifestPath = manifestRel;
      const manifest = parseManifest(readJson(absolute));

      const bytesPerSecond =
        manifest.encodedBytes !== null && manifest.duration && manifest.duration > 0
          ? Math.round(manifest.encodedBytes / manifest.duration)
          : null;
      metrics.push(
        metricLte(
          "encoded-bytes-per-second",
          "Encoded video bitrate",
          "render-manifest",
          bytesPerSecond,
          MAX_ENCODED_BYTES_PER_SECOND,
          "bytes/s"
        )
      );

      metrics.push(
        metricLte(
          "total-encoded-bytes",
          "Total encoded video size",
          "render-manifest",
          manifest.encodedBytes,
          MAX_TOTAL_ENCODED_BYTES,
          "bytes"
        )
      );

      // frameCount == duration * fps within tolerance.
      const expectedFrames =
        manifest.duration !== null && manifest.frameRate !== null
          ? manifest.duration * manifest.frameRate
          : null;
      const frameDelta =
        expectedFrames !== null && manifest.encodedFrameCount !== null
          ? Math.abs(manifest.encodedFrameCount - expectedFrames)
          : null;
      const frameTolerance =
        expectedFrames !== null
          ? Math.max(1, Math.ceil(expectedFrames * FRAME_COUNT_TOLERANCE_FRACTION))
          : 0;
      const frameOk = frameDelta !== null && frameDelta <= frameTolerance;
      metrics.push({
        id: "frame-count-matches-duration",
        label: "Encoded frame count vs duration*fps",
        source: "render-manifest",
        value: frameDelta,
        budget: frameTolerance,
        comparison: "approx==",
        unit: "frames-delta",
        ok: frameOk,
        detail:
          frameDelta === null
            ? "Cannot verify frame count: duration, frameRate, or encodedFrameCount missing."
            : frameOk
              ? `Encoded frames ${manifest.encodedFrameCount} match expected ${expectedFrames} (delta ${frameDelta} <= ${frameTolerance}).`
              : `Encoded frames ${manifest.encodedFrameCount} differ from expected ${expectedFrames} by ${frameDelta} (> ${frameTolerance}).`
      });

      metrics.push(
        metricGte(
          "output-width",
          "Output width",
          "render-manifest",
          manifest.width,
          MIN_OUTPUT_WIDTH,
          "px"
        )
      );
      metrics.push(
        metricGte(
          "output-height",
          "Output height",
          "render-manifest",
          manifest.height,
          MIN_OUTPUT_HEIGHT,
          "px"
        )
      );
    }
  }

  // ---- Live-3D render summary metrics ----------------------------------
  let resolvedSummaryPath: string | null = null;
  if (summaryRel) {
    const absolute = join(root, summaryRel);
    if (existsSync(absolute)) {
      resolvedSummaryPath = summaryRel;
      const summary = parseSummary(readJson(absolute));
      metrics.push(
        metricLte(
          "draw-calls-per-frame",
          "Peak draw calls per frame",
          "render-live-summary",
          summary.maxDrawCalls,
          MAX_DRAW_CALLS_PER_FRAME,
          "draw calls"
        )
      );
    }
  }

  const breaches = metrics.filter((metric) => !metric.ok).map((metric) => `${metric.id}: ${metric.detail}`);

  return {
    schema: "cartoon-studio-performance-budget/v1",
    ok: metrics.length > 0 && breaches.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    inputs: {
      manifestPath: resolvedManifestPath,
      summaryPath: resolvedSummaryPath
    },
    budgets: {
      maxEncodedBytesPerSecond: MAX_ENCODED_BYTES_PER_SECOND,
      maxTotalEncodedBytes: MAX_TOTAL_ENCODED_BYTES,
      maxDrawCallsPerFrame: MAX_DRAW_CALLS_PER_FRAME,
      frameCountToleranceFraction: FRAME_COUNT_TOLERANCE_FRACTION,
      minOutputWidth: MIN_OUTPUT_WIDTH,
      minOutputHeight: MIN_OUTPUT_HEIGHT
    },
    metrics,
    breaches:
      metrics.length === 0
        ? ["no-inputs: neither a render manifest nor a live-3D summary was found to evaluate."]
        : breaches
  };
}

export function writePerformanceBudgetReport(
  root: string,
  report: PerformanceBudgetReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
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
if (
  currentScript.endsWith("tools/cartoon-studio-performance-budget-gate/index.ts") ||
  currentScript.endsWith("tools/cartoon-studio-performance-budget-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const out = typeof args.out === "string" ? args.out : defaultOut;
  const report = createPerformanceBudgetReport(root, {
    manifestPath: typeof args.manifest === "string" ? args.manifest : undefined,
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    out
  });
  writePerformanceBudgetReport(root, report, out);
  for (const metric of report.metrics) {
    const status = metric.ok ? "PASS" : "FAIL";
    console.log(`[${status}] ${metric.detail}`);
  }
  console.log(`Report written to ${out}`);
  if (!report.ok) {
    console.error(report.breaches.join("\n"));
    process.exitCode = 1;
  }
}
