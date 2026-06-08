import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Animation Studio "NO FAKE PROOF" gate — PRD Phase H (H1).
 *
 * The render summary the other gates consume must be MEASURED, not self-reported.
 * A summary that simply asserts `passed:true` / `ok:true` / `verified:true` (with
 * no measured signals behind it) is a fake proof. This gate scans the render
 * summary (and any extra gate-input JSON passed in) for hard-coded pass flags and
 * fails when one is present, OR when the summary carries no measured signals at
 * all (empty seekProofs / stagedPerformance — i.e. nothing to compute a verdict
 * from).
 *
 * It is intentionally strict: a render summary should describe WHAT HAPPENED
 * (positions, mouthOpenness, bone ranges, caption windows), never WHETHER IT
 * PASSED. The pass/fail verdict belongs to the gates, not the artifact.
 *
 * Never hard-codes a pass; fails on missing/malformed input.
 */

export interface NoFakeProofReport {
  readonly schema: "animation-studio-no-fake-proof/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly scanned: readonly string[];
  readonly violations: readonly NoFakeProofViolation[];
  readonly blockers: readonly string[];
}

export interface NoFakeProofViolation {
  readonly file: string;
  readonly key: string;
  readonly reason: string;
}

export interface NoFakeProofOptions {
  readonly summaryPath?: string;
  readonly packageDir?: string;
  /** Extra gate-input JSON files to scan for hard-coded pass flags. */
  readonly extraInputs?: readonly string[];
  readonly out?: string;
  readonly generatedAt?: string;
}

const defaultSummaryPath =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";
const defaultOut = "tests/reports/animation-studio/no-fake-proof.json";

/** Self-reported pass flags that must never appear in a gate-input artifact. */
const FORBIDDEN_PASS_KEYS = /^(passed|verified|approved|accept(ed)?|isPass|qualityPass|gatePass)$/i;
/** `ok` is forbidden when its sibling object has no measured signals. */
const SOFT_PASS_KEY = /^ok$/i;

interface SummaryShape {
  readonly seekProofs?: readonly unknown[];
  readonly stagedPerformance?: readonly unknown[];
  readonly captionProofs?: readonly unknown[];
}

function resolveSummaryPath(options: NoFakeProofOptions): string {
  if (options.summaryPath) return options.summaryPath;
  if (options.packageDir) return join(options.packageDir, "render-live-summary.json");
  return defaultSummaryPath;
}

export function createNoFakeProofReport(
  root = process.cwd(),
  options: NoFakeProofOptions = {}
): NoFakeProofReport {
  const summaryRel = resolveSummaryPath(options);
  const inputs = [summaryRel, ...(options.extraInputs ?? [])];
  const blockers: string[] = [];
  const violations: NoFakeProofViolation[] = [];
  const scanned: string[] = [];

  for (const rel of inputs) {
    const absolute = join(root, rel);
    if (!existsSync(absolute)) {
      blockers.push(`${rel} is missing — cannot enforce the no-fake-proof rule on a render that did not run.`);
      continue;
    }
    const parsed = readJson(absolute);
    if (parsed === null) {
      blockers.push(`${rel} is not valid JSON.`);
      continue;
    }
    scanned.push(rel);
    scanForForbiddenFlags(parsed, rel, "", violations);

    // The render summary itself must carry measured signals.
    if (rel === summaryRel) {
      const s = parsed as SummaryShape;
      const hasSignals =
        (Array.isArray(s.seekProofs) && s.seekProofs.length > 0) ||
        (Array.isArray(s.stagedPerformance) && s.stagedPerformance.length > 0);
      if (!hasSignals) {
        blockers.push(
          `${rel} carries no measured signals (seekProofs/stagedPerformance empty) — a verdict cannot be computed, so any pass would be fake.`
        );
      }
    }
  }

  for (const v of violations) {
    blockers.push(`${v.file}: hard-coded "${v.key}" — ${v.reason}`);
  }

  return {
    schema: "animation-studio-no-fake-proof/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    scanned,
    violations,
    blockers
  };
}

function scanForForbiddenFlags(
  node: unknown,
  file: string,
  path: string,
  out: NoFakeProofViolation[]
): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanForForbiddenFlags(item, file, `${path}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const siblingMeasuredSignals = hasMeasuredSignal(obj);
  for (const [key, value] of Object.entries(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (value === true && FORBIDDEN_PASS_KEYS.test(key)) {
      out.push({
        file,
        key: here,
        reason: "self-reported pass flag; verdicts must be computed by the gate from measured signals."
      });
    }
    if (value === true && SOFT_PASS_KEY.test(key) && !siblingMeasuredSignals) {
      out.push({
        file,
        key: here,
        reason: 'bare "ok:true" with no measured signals on the same object; looks like a hard-coded pass.'
      });
    }
    scanForForbiddenFlags(value, file, here, out);
  }
}

/** Does this object carry measured render data (not just boolean flags)? */
function hasMeasuredSignal(obj: Record<string, unknown>): boolean {
  const measuredKeys = [
    "seekProofs",
    "stagedPerformance",
    "captionProofs",
    "frameCount",
    "mouthOpenness",
    "boneRotationRanges",
    "position",
    "changedPixels",
    "drawCalls",
    "characters",
    "metrics",
    "blockers",
    // A per-metric verdict object carries the measured value it was computed from
    // (value/budget/comparison/detail). Its `ok` is a real verdict, not a fake proof.
    "value",
    "budget",
    "comparison",
    "detail",
    "breaches"
  ];
  return measuredKeys.some((k) => k in obj);
}

export function writeNoFakeProofReport(
  root: string,
  report: NoFakeProofReport,
  out = defaultOut
): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function readJson(path: string): unknown | null {
  try {
    if (statSync(path).size === 0) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv: readonly string[]) {
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
  currentScript.endsWith("tools/animation-studio-no-fake-proof-gate/index.ts") ||
  currentScript.endsWith("tools/animation-studio-no-fake-proof-gate/index.js")
) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createNoFakeProofReport(root, {
    summaryPath: typeof args.summary === "string" ? args.summary : undefined,
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined
  });
  writeNoFakeProofReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  console.log(`scanned ${report.scanned.length} input(s); ${report.violations.length} violation(s).`);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: no hard-coded pass flags; render summary carries measured signals.");
  }
}
