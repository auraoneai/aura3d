/**
 * Analyze retained measurements. This module never starts a browser or a device.
 * Real reports are read only after the global Phase A gate has been validated.
 */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareNativeBudget, type NativeBudgetResult, type NativePerformanceIdentity, type NativePerformanceReport } from "./native-budget";
import { NATIVE_WORKLOADS, type NativeWorkload } from "./native-workloads";

export interface CandidateIdentity {
  sourceSha256: string;
  sourceRunId: string;
  lockfileSha256: string;
  candidatePlanSha256: string;
  archives: Array<{ path: string; sha256: string }>;
}

export interface AcceptanceGate {
  runId: string;
  sourceInputDigest: string;
  lockfileSha256: string;
  candidatePlan: { sha256: string };
  archives: Array<{ path: string; sha256: string }>;
}

interface ManifestEntry { id: string; workloadSha256: string; report: string; sha256: string }
interface MeasurementManifest {
  schema: "aura3d.native-performance-manifest/1";
  runId: string;
  candidate: CandidateIdentity;
  status: "complete";
  workloads: ManifestEntry[];
  failures: unknown[];
}
interface LoadedMeasurements { manifest: MeasurementManifest; sha256: string; reports: Map<string, NativePerformanceReport> }

/** Retain distinct measurements and labels. CPU metrics are wall durations, not thread CPU time. */
export const NATIVE_METRICS = [
  "startupMs", "frameP50Ms", "frameP95Ms", "frameP99Ms", "cpuP50Ms", "cpuP95Ms", "cpuP99Ms",
  "gpuP50Ms", "gpuP95Ms", "gpuP99Ms", "cpuThreadTimeMs", "drawCalls", "heapBytes", "gpuResidentBytes",
  "liveResources", "resourcesAfterDispose", "glAllocations", "jsAllocations", "requestCount", "rawBytes", "gzipBytes", "brotliBytes",
  "bundleRawBytes", "bundleGzipBytes", "bundleBrotliBytes", "installedBytes"
] as const;

const digestPattern = /^[a-f0-9]{64}$/;
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Match the complete artifact set, not just the number of artifacts. */
export function assertCandidateIdentity(candidate: CandidateIdentity, gate: AcceptanceGate): void {
  const hashes = [candidate?.sourceSha256, candidate?.lockfileSha256, candidate?.candidatePlanSha256,
    gate?.sourceInputDigest, gate?.lockfileSha256, gate?.candidatePlan?.sha256];
  if (hashes.some((value) => typeof value !== "string" || !digestPattern.test(value)) ||
      !nonempty(candidate?.sourceRunId) || !nonempty(gate?.runId)) throw new Error("Missing or invalid candidate/gate identity");
  if (candidate.sourceSha256 !== gate.sourceInputDigest || candidate.sourceRunId !== gate.runId ||
      candidate.lockfileSha256 !== gate.lockfileSha256 || candidate.candidatePlanSha256 !== gate.candidatePlan.sha256) {
    throw new Error("Measurement candidate identity does not match the code-complete gate");
  }
  const normalize = (archives: CandidateIdentity["archives"]): string[] => {
    if (!Array.isArray(archives) || !archives.length) throw new Error("Missing candidate archives");
    const keys = archives.map((archive) => {
      if (!archive || !nonempty(archive.path) || !digestPattern.test(archive.sha256 ?? "")) throw new Error("Invalid candidate archive identity");
      return `${archive.path}\0${archive.sha256}`;
    });
    if (new Set(archives.map((archive) => archive.path)).size !== archives.length) throw new Error("Duplicate candidate archive path");
    return keys.sort();
  };
  const actual = normalize(candidate.archives), expected = normalize(gate.archives);
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    throw new Error("Measurement candidate archives do not match the code-complete gate");
  }
}

export interface WorkloadSources { workload: Uint8Array; probe: Uint8Array; profiler: Uint8Array }

export function readWorkloadSources(root: string): WorkloadSources {
  return { workload: readFileSync(resolve(root, "tools/performance/native-workloads.ts")),
    probe: readFileSync(resolve(root, "tests/browser/native-performance-probe.spec.ts")),
    profiler: readFileSync(resolve(root, "packages/debug/src/GPUProfiler.ts")) };
}

export function workloadDigest(source: WorkloadSources, workload: NativeWorkload): string {
  const hash = createHash("sha256");
  for (const [tag, bytes] of [["native-workloads.ts", source.workload], ["native-performance-probe.spec.ts", source.probe],
    ["GPUProfiler.ts", source.profiler], ["definition", Buffer.from(JSON.stringify(workload))]] as const) {
    hash.update(`${tag}:${bytes.byteLength}\n`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function readJson(path: string): { value: unknown; digest: string } {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular report file: ${path}`);
  const bytes = readFileSync(path);
  return { value: JSON.parse(bytes.toString("utf8")) as unknown, digest: sha256(bytes) };
}

function validateSessionSamples(report: NativePerformanceReport): void {
  const identity = report.identity;
  const known = (value: unknown) => nonempty(value) && !/^(unknown|unavailable|not[- ]?reported|n\/?a)$/i.test(value.trim());
  if (!known(identity?.device) && identity?.device !== "unavailable") throw new Error("Missing device identity; set NATIVE_PERF_DEVICE or explicitly record unavailable");
  if (report.schema !== "aura3d.native-performance/1" || !known(report.runId) || !identity ||
      !known(identity.browser) || !known(identity.browserVersion) || !known(identity.os) || !known(identity.backend) ||
      (identity.adapter !== null && !known(identity.adapter)) || (identity.driver !== null && !known(identity.driver))) {
    throw new Error("Missing or invalid performance identity");
  }
  if (!Array.isArray(report.sessions) || report.sessions.length < 3) throw new Error("At least three independent sessions are required");
  const ids = new Set<string>();
  for (const session of report.sessions) {
    if (!session || !known(session.id) || ids.has(session.id) || !Number.isSafeInteger(session.timedFrames) || session.timedFrames < 300) {
      throw new Error("Missing, duplicated or incomplete performance session");
    }
    ids.add(session.id);
    if (!session.metrics || typeof session.metrics !== "object") throw new Error("Missing session metrics");
    for (const metric of NATIVE_METRICS) {
      const value = session.metrics[metric];
      if (value === null) {
        if (!known(session.unavailable?.[metric])) throw new Error(`Missing unavailable reason for ${metric}`);
      } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`Missing or invalid sample ${metric}`);
      }
    }
  }
}

/** Load and verify a complete, hash-bound manifest after its caller validates the gate. */
export function loadMeasurements(root: string, manifestPath: string, source: WorkloadSources, gate?: AcceptanceGate): LoadedMeasurements {
  const absolute = resolve(root, manifestPath);
  const raw = readJson(absolute);
  const manifest = requireRecord(raw.value, "measurement manifest") as unknown as MeasurementManifest;
  if (manifest.schema !== "aura3d.native-performance-manifest/1" || manifest.status !== "complete" ||
      !nonempty(manifest.runId) || !Array.isArray(manifest.failures) || manifest.failures.length || !Array.isArray(manifest.workloads)) {
    throw new Error("Missing or incomplete performance measurement manifest");
  }
  const candidateGate: AcceptanceGate = gate ?? {
    runId: manifest.candidate?.sourceRunId, sourceInputDigest: manifest.candidate?.sourceSha256,
    lockfileSha256: manifest.candidate?.lockfileSha256, candidatePlan: { sha256: manifest.candidate?.candidatePlanSha256 },
    archives: manifest.candidate?.archives
  };
  assertCandidateIdentity(manifest.candidate, candidateGate);
  const expected = new Map(NATIVE_WORKLOADS.map((workload) => [workload.id as string, workload]));
  if (manifest.workloads.length !== expected.size || new Set(manifest.workloads.map((entry) => entry.id)).size !== expected.size) {
    throw new Error("Performance manifest must contain every fixed workload exactly once");
  }
  const reports = new Map<string, NativePerformanceReport>();
  for (const entry of manifest.workloads) {
    const workload = expected.get(entry.id);
    if (!workload || !/^[a-z0-9-]+\.json$/.test(entry.report ?? "") || !digestPattern.test(entry.sha256 ?? "")) throw new Error("Invalid workload report entry");
    const expectedHash = workloadDigest(source, workload);
    if (entry.workloadSha256 !== expectedHash) throw new Error(`Workload digest mismatch: ${entry.id}`);
    const reportFile = readJson(join(dirname(absolute), entry.report));
    if (reportFile.digest !== entry.sha256) throw new Error(`Measurement report hash mismatch: ${entry.id}`);
    const report = requireRecord(reportFile.value, "measurement report") as unknown as NativePerformanceReport;
    assertCandidateIdentity(report.candidate as CandidateIdentity, candidateGate);
    validateSessionSamples(report);
    const id = report.identity;
    if (report.runId !== manifest.runId || id.workloadId !== workload.id || id.workloadSha256 !== expectedHash ||
        id.assetSha256 !== (workload.asset?.sha256 ?? null) || id.seed !== workload.seed || id.look !== workload.look ||
        id.quality !== workload.quality || id.viewport?.width !== workload.viewport.width ||
        id.viewport?.height !== workload.viewport.height || id.viewport?.dpr !== workload.viewport.dpr || id.backend !== workload.backend) {
      throw new Error(`Measurement does not match fixed workload: ${entry.id}`);
    }
    reports.set(entry.id, report);
  }
  return { manifest, sha256: raw.digest, reports };
}

export interface BenchmarkOptions { root: string; gatePath: string; input: string; baseline?: string; rerun?: string; rerunBaseline?: string; runId?: string }
export interface BenchmarkResult {
  schema: "aura3d.native-benchmark-analysis/1";
  status: "pass" | "fail" | "inconclusive" | "no-data";
  runId: string;
  candidate: CandidateIdentity;
  inputSha256: string;
  baselineSha256: string | null;
  workloads: Array<{ id: string; identity: NativePerformanceIdentity; result: NativeBudgetResult }>;
  methodology: string[];
}

/** Injecting a validator is useful for synthetic source tests; the CLI always uses the real gate. */
export async function analyzeNativeBenchmark(
  options: BenchmarkOptions,
  validateGate: (input: { root: string; gatePath: string }) => AcceptanceGate | Promise<AcceptanceGate>
): Promise<BenchmarkResult> {
  if (!options.gatePath || !options.input) throw new Error("Both a code-complete gate and --input measurement manifest are required");
  if (!!options.rerun !== !!options.rerunBaseline) throw new Error("A rerun requires both --rerun and --rerun-baseline");
  // This must remain before reads of source or any candidate measurement.
  const gate = await validateGate({ root: options.root, gatePath: options.gatePath });
  const source = readWorkloadSources(options.root);
  const current = loadMeasurements(options.root, options.input, source, gate);
  if (options.runId && current.manifest.runId !== options.runId) throw new Error("Acceptance run ID does not match measurement manifest");
  const baseline = options.baseline ? loadMeasurements(options.root, options.baseline, source) : undefined;
  const rerun = options.rerun ? loadMeasurements(options.root, options.rerun, source, gate) : undefined;
  const rerunBaseline = options.rerunBaseline ? loadMeasurements(options.root, options.rerunBaseline, source) : undefined;
  const workloads = NATIVE_WORKLOADS.map(({ id }) => ({
    id,
    identity: current.reports.get(id)!.identity,
    result: compareNativeBudget(baseline?.reports.get(id) ?? ({} as NativePerformanceReport), current.reports.get(id)!, {
      metrics: NATIVE_METRICS.map((name) => ({ name })),
      ...(rerun && rerunBaseline ? { rerun: { candidate: rerun.reports.get(id)!, baseline: rerunBaseline.reports.get(id)! } } : {})
    })
  }));
  const statuses = workloads.map(({ result }) => result.status);
  const status = statuses.includes("fail") ? "fail" : statuses.includes("inconclusive") ? "inconclusive" : statuses.includes("no-data") ? "no-data" : "pass";
  return { schema: "aura3d.native-benchmark-analysis/1", status, runId: current.manifest.runId, candidate: current.manifest.candidate,
    inputSha256: current.sha256, baselineSha256: baseline?.sha256 ?? null, workloads,
    methodology: ["Fixed source-bound workloads, at least three independent sessions and 300 timed frames per session.",
      "CPU p50/p95/p99 are synchronous submission wall durations, not thread CPU time; GPU timing is reported only when available.",
      "Unavailable metrics and missing or noisy baselines are not passes; this report does not establish physical-device support."] };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2), values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!name || !["--input", "--baseline", "--rerun", "--rerun-baseline", "--out", "--gate"].includes(name) || !value || value.startsWith("--") || values.has(name)) {
      throw new Error("Usage: native-benchmark --input <manifest> [--baseline <manifest>] [--rerun <manifest> --rerun-baseline <manifest>] [--out <file>] [--gate <file>]");
    }
    values.set(name, value);
  }
  const root = process.cwd(), gatePath = values.get("--gate") ?? process.env.AURA3D_CODE_COMPLETE_GATE ?? "";
  const validatorModule = await import(pathToFileURL(resolve(root, "tools/native-capability-gate/index.mjs")).href) as {
    validateAcceptanceGate: (input: { root: string; gatePath: string }) => AcceptanceGate | Promise<AcceptanceGate>;
  };
  const result = await analyzeNativeBenchmark({ root, gatePath, input: values.get("--input") ?? "", baseline: values.get("--baseline"),
    rerun: values.get("--rerun"), rerunBaseline: values.get("--rerun-baseline"), runId: process.env.NATIVE_ACCEPTANCE_RUN_ID }, validatorModule.validateAcceptanceGate);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (values.has("--out")) { const out = resolve(root, values.get("--out")!); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, output); }
  else process.stdout.write(output);
  if (result.status !== "pass") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
