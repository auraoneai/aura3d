import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  analyzeNativeBenchmark, assertCandidateIdentity, NATIVE_METRICS, NATIVE_UNSUPPORTED_ALLOWED_METRICS, readWorkloadSources, workloadDigest,
  type AcceptanceGate, type CandidateIdentity
} from "../../../tools/performance/native-benchmark";
import { NATIVE_WORKLOADS } from "../../../tools/performance/native-workloads";
import { installedCandidateBytes } from "../../../tools/performance/native-installed-bytes";
import { gzipSync } from "node:zlib";

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const gate: AcceptanceGate = { runId: "source-1", sourceInputDigest: "a".repeat(64), lockfileSha256: "b".repeat(64),
  candidatePlan: { sha256: "c".repeat(64) }, archives: [{ path: "reports/engine.tgz", sha256: "d".repeat(64) }] };
const identity: CandidateIdentity = { sourceSha256: gate.sourceInputDigest, sourceRunId: gate.runId,
  lockfileSha256: gate.lockfileSha256, candidatePlanSha256: gate.candidatePlan.sha256, archives: gate.archives };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aura-native-benchmark-"));
  roots.push(root);
  for (const name of ["tools/performance/native-workloads.ts", "tests/browser/native-performance-probe.spec.ts", "packages/debug/src/GPUProfiler.ts"]) {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(resolve(name)));
  }
  return root;
}

function writeMeasurements(root: string, directory: string, runId: string, options: {
  baseline?: boolean; value?: number; missingMetric?: string; nullMetric?: string; partial?: boolean; device?: string;
  unsupported?: readonly string[];
} = {}): string {
  const dir = resolve(root, directory);
  mkdirSync(dir, { recursive: true });
  const source = readWorkloadSources(root);
  const entries = NATIVE_WORKLOADS.map((workload) => {
    const hash = workloadDigest(source, workload);
    const metrics: Record<string, number | null> = Object.fromEntries(NATIVE_METRICS.map((metric) => [metric, options.value ?? 10]));
    if (options.missingMetric) delete metrics[options.missingMetric];
    if (options.nullMetric) metrics[options.nullMetric] = null;
    const unavailable: Record<string, string> = {};
    for (const name of options.unsupported ?? []) { metrics[name] = null; unavailable[name] = `unsupported: ${name} not exposed`; }
    const report = { schema: "aura3d.native-performance/1", runId, candidate: identity,
      ...(options.baseline ? { baselineVersion: "4.7.1" } : {}),
      identity: { workloadId: workload.id, workloadSha256: hash, assetSha256: workload.asset?.sha256 ?? null,
        seed: workload.seed, look: workload.look, quality: workload.quality, viewport: workload.viewport,
        browser: "chromium-automation", browserVersion: "123", os: "linux", backend: workload.backend,
        device: options.device ?? "test-device", adapter: "test-adapter", driver: null },
      sessions: [1, 2, 3].map((index) => ({ id: `${runId}/${workload.id}/session-${index}`, timedFrames: 300, metrics,
        ...(Object.keys(unavailable).length ? { unavailable } : {}) })) };
    const bytes = `${JSON.stringify(report)}\n`;
    const filename = `${workload.id}.json`;
    writeFileSync(join(dir, filename), bytes);
    return { id: workload.id, workloadSha256: hash, report: filename, sha256: digest(bytes) };
  });
  const manifest = { schema: "aura3d.native-performance-manifest/1", runId, candidate: identity,
    status: options.partial ? "partial" : "complete", workloads: entries, failures: options.partial ? ["sample failure"] : [] };
  const path = join(dir, "manifest.json");
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}

describe("candidate-bound native benchmark analysis", () => {
  it("checks the global gate before touching measurement files", async () => {
    const failGate = async () => { throw new Error("gate refused"); };
    await expect(analyzeNativeBenchmark({ root: "/does-not-exist", gatePath: "gate.json", input: "missing.json" }, failGate))
      .rejects.toThrow("gate refused");
  });

  it("requires exact source, lock, plan and complete archive identities", () => {
    expect(() => assertCandidateIdentity(identity, gate)).not.toThrow();
    expect(() => assertCandidateIdentity({ ...identity, sourceSha256: "f".repeat(64) }, gate)).toThrow(/identity/);
    expect(() => assertCandidateIdentity({ ...identity, archives: [] }, gate)).toThrow(/archives/);
    expect(() => assertCandidateIdentity({ ...identity, archives: [{ path: "other.tgz", sha256: "d".repeat(64) }] }, gate)).toThrow(/archives/);
    expect(() => assertCandidateIdentity({ ...identity, archives: [...identity.archives, ...identity.archives] }, gate)).toThrow(/Duplicate/);
  });

  it("analyzes all fixed workloads and does not claim a pass without a baseline", async () => {
    const root = fixtureRoot();
    const input = writeMeasurements(root, "candidate", "acceptance-1");
    const result = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, runId: "acceptance-1" }, () => gate);
    expect(result.status).toBe("no-data");
    expect(result.workloads).toHaveLength(NATIVE_WORKLOADS.length);
    expect(result.workloads[0]!.result.metrics.find((metric) => metric.name === "drawCalls")?.candidateMedian).toBe(10);
    expect(result.methodology.join(" ")).toContain("not thread CPU time");
  });

  it("reports same-device regressions and accepts stable independent baselines", async () => {
    const root = fixtureRoot();
    const input = writeMeasurements(root, "candidate", "acceptance-1", { value: 11 });
    const baseline = writeMeasurements(root, "baseline", "baseline-1", { baseline: true, value: 10 });
    const result = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baseline }, () => gate);
    expect(result.status).toBe("fail");
    expect(result.workloads[0]!.result.metrics.find((metric) => metric.name === "frameP95Ms")?.status).toBe("regression");
  });

  it("records an explicitly unavailable device as no-data but rejects a missing identity", async () => {
    const root = fixtureRoot();
    const input = writeMeasurements(root, "candidate", "acceptance-1", { device: "unavailable" });
    const baseline = writeMeasurements(root, "baseline", "baseline-1", { baseline: true, device: "unavailable" });
    const result = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baseline }, () => gate);
    expect(result.status).toBe("no-data");
    expect(result.workloads[0]!.identity.device).toBe("unavailable");
    const missing = writeMeasurements(root, "missing", "acceptance-2", { device: "" });
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input: missing }, () => gate)).rejects.toThrow(/device identity/);
  });

  it("rejects incomplete manifests, missing samples and missing unavailable explanations", async () => {
    const root = fixtureRoot();
    const partial = writeMeasurements(root, "partial", "acceptance-1", { partial: true });
    const missing = writeMeasurements(root, "missing", "acceptance-1", { missingMetric: "drawCalls" });
    const unavailable = writeMeasurements(root, "unavailable", "acceptance-1", { nullMetric: "gpuP95Ms" });
    for (const [input, reason] of [[partial, /incomplete/], [missing, /drawCalls/], [unavailable, /unavailable reason/]] as const) {
      await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input }, () => gate)).rejects.toThrow(reason);
    }
  });

  it("excludes only allowed, uniformly unsupported metrics so the real probe output can pass", async () => {
    const root = fixtureRoot();
    const unsupported = ["gpuP50Ms", "gpuP95Ms", "gpuP99Ms", "gpuResidentBytes", "jsAllocations", "bundleRawBytes", "bundleGzipBytes", "bundleBrotliBytes"];
    for (const name of unsupported) expect(NATIVE_UNSUPPORTED_ALLOWED_METRICS.has(name)).toBe(true);
    for (const name of ["frameP95Ms", "drawCalls", "startupMs", "installedBytes", "requestCount"]) expect(NATIVE_UNSUPPORTED_ALLOWED_METRICS.has(name)).toBe(false);
    const input = writeMeasurements(root, "candidate", "acceptance-1", { unsupported });
    const baseline = writeMeasurements(root, "baseline", "baseline-1", { baseline: true, unsupported });
    const result = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baseline }, () => gate);
    expect(result.status).toBe("pass");
    expect(result.workloads[0]!.result.excludedUnsupported).toEqual(unsupported);
    // A required metric reported unavailable keeps the aggregate at no-data.
    const lost = writeMeasurements(root, "lost", "acceptance-2", { unsupported: [...unsupported, "installedBytes"] });
    expect((await analyzeNativeBenchmark({ root, gatePath: "gate.json", input: lost, baseline }, () => gate)).status).toBe("no-data");
  });

  it("selects the retained same-device baseline from a versioned index and verifies it", async () => {
    const root = fixtureRoot();
    const input = writeMeasurements(root, "candidate", "acceptance-1", { value: 10 });
    const baseline = writeMeasurements(root, "baseline", "baseline-1", { baseline: true, value: 10 });
    const entry = { device: "test-device", browser: "chromium-automation", browserVersion: "123", baselineVersion: "4.7.1",
      manifest: "baseline/manifest.json", sha256: digest(readFileSync(baseline)) };
    const index = join(root, "baselines.json");
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1",
      baselines: [{ ...entry, device: "other-device", manifest: "missing.json" }, entry] }));
    const result = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate);
    expect(result.status).toBe("pass");
    expect(result.baselineSource).toEqual({ kind: "retained-index", manifest: "baseline/manifest.json", baselineVersion: "4.7.1" });
    // No entry for this device: no baseline, so no pass.
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1", baselines: [{ ...entry, device: "other-device" }] }));
    const none = await analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate);
    expect(none).toMatchObject({ status: "no-data", baselineSource: null });
    // Changed retained bytes, wrong version, duplicate or unavailable devices are refused.
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1", baselines: [{ ...entry, sha256: "0".repeat(64) }] }));
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate)).rejects.toThrow(/changed/);
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1", baselines: [{ ...entry, baselineVersion: "4.6.0" }] }));
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate)).rejects.toThrow(/differ from their index/);
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1", baselines: [entry, entry] }));
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate)).rejects.toThrow(/Duplicate/);
    writeFileSync(index, JSON.stringify({ schema: "aura3d.native-performance-baselines/1", baselines: [{ ...entry, device: "unavailable" }] }));
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input, baselineIndex: "baselines.json" }, () => gate)).rejects.toThrow(/Invalid retained/);
  });

  it("rejects altered reports and acceptance-run mismatches", async () => {
    const root = fixtureRoot();
    const input = writeMeasurements(root, "candidate", "acceptance-1");
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input, runId: "different" }, () => gate)).rejects.toThrow(/run ID/);
    writeFileSync(join(dirname(input), "primitive.json"), "{}");
    await expect(analyzeNativeBenchmark({ root, gatePath: "gate.json", input }, () => gate)).rejects.toThrow(/hash mismatch/);
  });

  it("measures installed bytes from digest-verified candidate archives, counting regular files only", () => {
    const root = fixtureRoot();
    const entry = (name: string, type: string, body: Buffer) => {
      const header = Buffer.alloc(512);
      header.write(name, 0, "utf8");
      header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
      header.write(type, 156, "ascii");
      return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
    };
    const tgz = gzipSync(Buffer.concat([entry("package/", "5", Buffer.alloc(0)), entry("././@LongLink", "L", Buffer.from("package/long-name.js\0")),
      entry("package/long-name.js", "0", Buffer.alloc(700, 1)), entry("pax", "x", Buffer.alloc(30)), entry("package/package.json", "0", Buffer.from("{}")),
      Buffer.alloc(1024)]));
    writeFileSync(join(root, "engine.tgz"), tgz);
    expect(installedCandidateBytes(root, [{ path: "engine.tgz", sha256: digest(tgz) }])).toBe(702);
    expect(() => installedCandidateBytes(root, [{ path: "engine.tgz", sha256: "0".repeat(64) }])).toThrow(/digest mismatch/);
    expect(() => installedCandidateBytes(root, [])).toThrow(/no candidate archives/);
  });
});
