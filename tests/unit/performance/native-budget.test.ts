import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  compareNativeBudget,
  median,
  type NativePerformanceReport
} from "../../../tools/performance/native-budget";
import { NATIVE_WORKLOADS, nativeWorkload, summarizeSamples } from "../../../tools/performance/native-workloads";

const policy = { metrics: [{ name: "frameP95Ms" }] };
const identity = {
  workloadId: "primitive", workloadSha256: "a".repeat(64), assetSha256: null,
  seed: 734, look: "product-studio", quality: "production",
  viewport: { width: 800, height: 600, dpr: 1 }, browser: "chromium-automation",
  browserVersion: "123.0", os: "linux", backend: "webgl2", device: "test-machine-1",
  adapter: "software adapter", driver: null
};

function report(runId: string, values: Array<number | null>, baseline = false): NativePerformanceReport {
  return {
    schema: "aura3d.native-performance/1", runId,
    candidate: { sourceSha256: (baseline ? "b" : "c").repeat(64) },
    ...(baseline ? { baselineVersion: "1.0.0" } : {}), identity: structuredClone(identity),
    sessions: values.map((value, index) => ({
      id: `${runId}-${index}`, timedFrames: 300,
      metrics: { frameP95Ms: value },
      ...(value === null ? { unavailable: { frameP95Ms: "timer not available" } } : {})
    }))
  };
}

describe("native performance budget", () => {
  it("uses the median of session results and the specified 5% threshold", () => {
    expect(median([10, 1, 7, 3])).toBe(5);
    const baseline = report("baseline", [9, 10, 11], true);
    // Median absolute deviation = 1 / 10, too noisy; use a stable baseline
    // to exercise the exact threshold instead.
    baseline.sessions = report("baseline", [10, 10, 10], true).sessions;
    const equal = compareNativeBudget(baseline, report("candidate", [10.5, 10.5, 10.5]), policy);
    expect(equal.status).toBe("pass");
    expect(equal.metrics[0]).toMatchObject({ baselineMedian: 10, candidateMedian: 10.5, regressionThreshold: 0.05 });
    expect(compareNativeBudget(baseline, report("candidate", [10.6, 10.6, 10.6]), policy).status).toBe("fail");
  });

  it("uses twice baseline relative MAD when it is greater than 5%", () => {
    const baseline = report("baseline", [97, 100, 103], true);
    const within = compareNativeBudget(baseline, report("candidate", [105, 105, 105]), policy);
    expect(within.metrics[0]?.relativeBaselineNoise).toBeCloseTo(0.03);
    expect(within.metrics[0]?.regressionThreshold).toBeCloseTo(0.06);
    expect(within.status).toBe("pass");
    expect(compareNativeBudget(baseline, report("candidate", [107, 107, 107]), policy).status).toBe("fail");
  });

  it("requires a single independent rerun when either side is noisy", () => {
    const baseline = report("baseline", [10, 10, 10], true);
    const candidate = report("candidate", [8, 10, 12]);
    const first = compareNativeBudget(baseline, candidate, policy);
    expect(first).toMatchObject({ status: "inconclusive", metrics: [{ rerunRequired: true }] });
    const noisyRegression = compareNativeBudget(baseline, report("slower", [10, 12, 14]), policy);
    expect(noisyRegression).toMatchObject({ status: "inconclusive", metrics: [{ exceedsRegressionThreshold: true, rerunRequired: true }] });
    const resolved = compareNativeBudget(baseline, candidate, {
      ...policy, rerun: { baseline: report("baseline-rerun", [10, 10, 10], true), candidate: report("candidate-rerun", [10.6, 10.6, 10.6]) }
    });
    expect(resolved).toMatchObject({ status: "fail", metrics: [{ comparedRun: "rerun", status: "regression", rerunRequired: false }] });
    const stillNoisy = compareNativeBudget(baseline, candidate, {
      ...policy, rerun: { baseline: report("baseline-rerun", [10, 10, 10], true), candidate: report("candidate-rerun", [8, 10, 12]) }
    });
    expect(stillNoisy).toMatchObject({ status: "inconclusive", metrics: [{ comparedRun: "rerun", rerunRequired: false }] });
    const noisyWithLimit = compareNativeBudget(baseline, candidate, { metrics: [{ name: "frameP95Ms", absoluteMax: 5 }] });
    expect(noisyWithLimit).toMatchObject({ status: "inconclusive", metrics: [{ absolute: { status: "no-data" } }] });
  });

  it("rejects a rerun with changed source or reused sessions", () => {
    const baseline = report("baseline", [8, 10, 12], true);
    const candidate = report("candidate", [10, 10, 10]);
    const sameRun = compareNativeBudget(baseline, candidate, {
      ...policy, rerun: { baseline, candidate: report("candidate-rerun", [10, 10, 10]) }
    });
    expect(sameRun.status).toBe("inconclusive");
    expect(sameRun.metrics[0]?.reason).toContain("independent");
    const modified = report("candidate-rerun", [10, 10, 10]);
    modified.candidate.sourceSha256 = "d".repeat(64);
    const differentSource = compareNativeBudget(baseline, candidate, {
      ...policy, rerun: { baseline: report("baseline-rerun", [10, 10, 10], true), candidate: modified }
    });
    expect(differentSource.metrics[0]?.reason).toContain("source");
  });

  it("does not report a pass for zero or unavailable baseline data", () => {
    const zero = compareNativeBudget(report("base", [0, 0, 0], true), report("candidate", [2, 2, 2]), {
      metrics: [{ name: "frameP95Ms", absoluteMax: 3 }]
    });
    expect(zero).toMatchObject({ status: "no-data", metrics: [{ status: "no-data", absolute: { maximum: 3, status: "pass" } }] });
    const unavailable = compareNativeBudget(report("base", [null, null, null], true), report("candidate", [4, 4, 4]), {
      metrics: [{ name: "frameP95Ms", absoluteMax: 3 }]
    });
    expect(unavailable).toMatchObject({ status: "fail", metrics: [{ status: "no-data", absolute: { status: "fail" } }] });
    const missingBaseline = compareNativeBudget({} as NativePerformanceReport, report("candidate", [4, 4, 4]), {
      metrics: [{ name: "frameP95Ms", absoluteMax: 3 }]
    });
    expect(missingBaseline).toMatchObject({ status: "fail", metrics: [{ status: "no-data", absolute: { status: "fail" } }] });
    const noisy = compareNativeBudget(report("base", [0, 0, 0], true), report("candidate", [2, 4, 6]), {
      metrics: [{ name: "frameP95Ms", absoluteMax: 3 }]
    });
    expect(noisy).toMatchObject({ status: "inconclusive", metrics: [{ absolute: { status: "no-data" }, rerunRequired: true }] });
  });

  it("refuses partial, malformed, unidentified and dissimilar reports", () => {
    const baseline = report("base", [10, 10, 10], true);
    const missing = report("candidate", [10, null, 10]);
    expect(compareNativeBudget(baseline, missing, policy).status).toBe("no-data");
    const tooFew = report("candidate", [10, 10]);
    expect(compareNativeBudget(baseline, tooFew, policy).metrics[0]?.reason).toContain("sessions");
    const short = report("candidate", [10, 10, 10]);
    short.sessions[1]!.timedFrames = 299;
    expect(compareNativeBudget(baseline, short, policy).metrics[0]?.reason).toContain("timed frames");
    const duplicate = report("candidate", [10, 10, 10]);
    duplicate.sessions[1]!.id = duplicate.sessions[0]!.id;
    expect(compareNativeBudget(baseline, duplicate, policy).metrics[0]?.reason).toContain("duplicate");
    const reused = report("candidate", [10, 10, 10]);
    reused.sessions[0]!.id = baseline.sessions[0]!.id;
    expect(compareNativeBudget(baseline, reused, policy).metrics[0]?.reason).toContain("sessions must be independent");
    const unexplained = report("candidate", [10, null, 10]);
    delete unexplained.sessions[1]!.unavailable;
    expect(compareNativeBudget(baseline, unexplained, policy).metrics[0]?.reason).toContain("unavailable reason");
    const otherDevice = report("candidate", [10, 10, 10]);
    otherDevice.identity.device = "test-machine-2";
    expect(compareNativeBudget(baseline, otherDevice, policy).metrics[0]?.reason).toContain("identity differs");
    otherDevice.identity.device = "unknown";
    expect(compareNativeBudget(baseline, otherDevice, policy).metrics[0]?.reason).toContain("invalid workload/device");
  });

  it("rejects invalid policy and requires every configured metric", () => {
    const base = report("base", [10, 10, 10], true);
    const next = report("next", [10, 10, 10]);
    expect(() => compareNativeBudget(base, next, { metrics: [] })).toThrow(/policy/);
    expect(() => compareNativeBudget(base, next, { metrics: [{ name: "x" }, { name: "x" }] })).toThrow(/duplicate/);
    expect(() => compareNativeBudget(base, next, { ...policy, minimumSessions: 2 })).toThrow(/policy/);
    expect(compareNativeBudget(base, next, { metrics: [{ name: "frameP95Ms" }, { name: "gpuMs" }] }).status).toBe("no-data");
  });
});

describe("native performance workload definitions", () => {
  it("fixes the seven required scenes, quality, seed, viewport and sampling policy", () => {
    expect(NATIVE_WORKLOADS.map((item) => item.id)).toEqual([
      "primitive", "product", "instances", "animation", "game-loop", "effects", "asset-import"
    ]);
    for (const workload of NATIVE_WORKLOADS) {
      expect(workload).toMatchObject({ seed: 251025, look: "product-studio", quality: "production", backend: "webgl2",
        viewport: { width: 640, height: 360, dpr: 1 }, warmupFrames: 30, timedFrames: 300 });
      expect(nativeWorkload(workload.id)).toBe(workload);
      if (workload.asset) {
        const bytes = readFileSync(workload.asset.url.slice(1));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(workload.asset.sha256);
        expect(workload.asset.license).toBeTruthy();
        expect(workload.asset.provenance).toBeTruthy();
      }
    }
  });

  it("summarizes timed frames without accepting missing or invalid data", () => {
    expect(summarizeSamples([4, 1, 2, 3])).toEqual({ p50: 2, p95: 4, p99: 4, count: 4 });
    expect(summarizeSamples([])).toBeNull();
    expect(summarizeSamples([1, Number.NaN])).toBeNull();
    expect(summarizeSamples([1, -1])).toBeNull();
  });
});
