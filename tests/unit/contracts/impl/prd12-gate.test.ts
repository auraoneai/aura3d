import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { G_REG_FLOORS, calibrate, selfTest } from "../../../../tools/quality-gate/src/calibrate";
import { compareToGolden, loadGoldens, proposeGoldenUpdate } from "../../../../tools/quality-gate/src/golden";
import { appendRound, trend } from "../../../../tools/quality-gate/src/history";
import { buildPacket, computeDrift, validateBenchmarkJudgement, validateGameJudgement } from "../../../../tools/quality-gate/src/rubric";
import { stepSummary, trendSvg } from "../../../../tools/quality-gate/src/report";
import { classifyDir, toFile } from "../../../../tools/quality-gate/src/classify-tools";
import type { CapturedItem, GoldenManifest, MetricValue, PanelRoundRecordDoc } from "../../../../tools/quality-gate/src/types";

const CAPTURE = { path: "f.png", sha256: "0".repeat(64), width: 1280, height: 720, dpr: 1 } as const;
const ENV = { commitSha: "abc123", githubRunId: "1", runnerImage: "macos-14/1", gpuRenderer: "ANGLE Metal", browserVersion: "139", launchArgs: [] };

const ITEM: CapturedItem = {
  itemId: "bench:01", kind: "benchmark-scene", aura: CAPTURE, reference: CAPTURE,
  masks: {}, variants: {}, repeats: [], env: ENV
};

const mv = (metric: MetricValue["metric"], distance: number, region: MetricValue["region"] = "frame"): MetricValue =>
  ({ metric, region, aura: distance, reference: null, pairwise: distance, status: "ok" });

const GOLDEN_ENTRY = {
  itemId: "bench:01", image: CAPTURE, masks: {}, approvedBy: "round-0", supersedes: null,
  thresholds: [{
    itemId: "bench:01", metric: "flip" as const, region: "frame" as const, noiseMax: 0.01,
    brokenControls: {}, threshold: 0.05, rejects: ["no-shadows" as const], active: true,
    calibratedAt: { commitSha: "abc", runnerImage: "macos-14/1" }
  }]
};

const ROUND: PanelRoundRecordDoc = {
  schema: "aura3d.quality-gate.panel/1", roundId: "round-7", env: ENV,
  thresholdsFrozenAt: "abc123", calibration: [], canaryPassed: true, benchmark: [], games: [],
  aggregates: [{ itemId: "bench:01", median: 8, classes: [], verdict: "pass" }]
};

describe("calibrate (§6.4)", () => {
  const noise = [[mv("flip", 0.005)], [mv("flip", 0.008)], [mv("flip", 0.003)]];
  it("T = max(3*N, floor) and rejects a discriminated control", () => {
    const report = calibrate(ITEM, {
      noise,
      variants: { "no-shadows": { aura: [mv("flip", 0.2)] }, "dpr-half": { aura: [mv("flip", 0.3)] } }
    });
    const t = report.thresholds.find((x) => x.metric === "flip" && x.region === "frame")!;
    expect(t.noiseMax).toBe(0.008);
    expect(t.threshold).toBe(Math.max(3 * 0.008, G_REG_FLOORS.flip!));
    // T = 0.024 ≤ 0.5 * 0.2 and 0.5 * 0.3 → both controls rejected by this triple.
    expect(t.rejects).toEqual(expect.arrayContaining(["no-shadows", "dpr-half"]));
    expect(report.uncoveredControls).toEqual([]);
  });
  it("uncovered applicable controls mark calibration-broken", () => {
    const report = calibrate(ITEM, { noise, variants: { "no-shadows": { aura: [mv("flip", 0.02)] } } });
    // B = 0.02, T = 0.024 > 0.5*B = 0.01 → not rejected → uncovered.
    expect(report.uncoveredControls).toEqual(["no-shadows"]);
  });
  it("self-test flags a covered control whose re-measure no longer exceeds T", () => {
    const report = calibrate(ITEM, { noise, variants: { "no-shadows": { aura: [mv("flip", 0.4)] } } });
    expect(selfTest(report, { "no-shadows": [mv("flip", 0.01)] })).toEqual(["no-shadows"]);
    expect(selfTest(report, { "no-shadows": [mv("flip", 0.5)] })).toEqual([]);
  });
});

describe("golden store (§7.5)", () => {
  it("loadGoldens rejects a non-goldens/1 schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-"));
    const path = join(dir, "m.json");
    writeFileSync(path, JSON.stringify({ schema: "other", entries: [] }));
    expect(() => loadGoldens(path)).toThrow(/goldens\/1/);
  });
  it("compareToGolden reports only calibrated-threshold exceedances", () => {
    const failure = compareToGolden(ITEM, GOLDEN_ENTRY, [mv("flip", 0.09), mv("ssim", 0.5)]);
    expect(failure.verdict).toBe("regression");
    expect(failure.failures.map((f) => f.metric)).toEqual(["flip"]);
    expect(compareToGolden(ITEM, GOLDEN_ENTRY, [mv("flip", 0.01)]).verdict).toBe("pass");
  });
  it("proposeGoldenUpdate refuses without a passing aggregate", () => {
    const badRound = { ...ROUND, aggregates: [{ itemId: "bench:01", median: 2, classes: [], verdict: "regression" as const }] };
    expect(() => proposeGoldenUpdate({
      items: [ITEM], round: badRound, calibrations: new Map(),
      runnerImage: ENV.runnerImage, gpuRenderer: ENV.gpuRenderer
    })).toThrow(/refused/);
    const manifest = proposeGoldenUpdate({
      items: [ITEM], round: ROUND, calibrations: new Map([["bench:01", GOLDEN_ENTRY.thresholds]]),
      runnerImage: ENV.runnerImage, gpuRenderer: ENV.gpuRenderer
    });
    expect(manifest.schema).toBe("aura3d.quality-gate.goldens/1");
    expect(manifest.entries[0].approvedBy).toBe("round-7");
  });
});

describe("history + report", () => {
  it("appendRound writes jsonl and trend reads medians", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-"));
    const idx = join(dir, "index.jsonl");
    appendRound(ROUND, idx);
    appendRound({ ...ROUND, roundId: "round-8", aggregates: [{ itemId: "bench:01", median: 9, classes: [], verdict: "pass" }] }, idx);
    expect(trend(idx, "bench:01").map((p) => p.median)).toEqual([8, 9]);
  });
  it("stepSummary renders the failing metric table", () => {
    const md = stepSummary([{ itemId: "bench:01", verdicts: ["regression"], metrics: [mv("flip", 0.09)] }], new Map([["flip@frame", 0.05]]));
    expect(md).toContain("flip@frame");
    expect(md).toContain("0.0900 / 0.0500");
    expect(trendSvg([{ roundId: "r1", median: 8 }])).toContain("<svg");
  });
});

describe("rubric + blind A/B + drift", () => {
  it("validateGameJudgement requires a >=200-char critique and known categories", () => {
    const base = {
      itemId: "g1", judge: { kind: "vision-model" as const, id: "judge-a" },
      scores: { lighting: 5 }, dominantCauses: [], competitiveWithModernThree: true
    };
    expect(() => validateGameJudgement({ ...base, critique: "short" })).toThrow(/200/);
    expect(validateGameJudgement({ ...base, critique: "x".repeat(200) }).itemId).toBe("g1");
    expect(() => validateGameJudgement({ ...base, critique: "x".repeat(200), scores: { bogus: 1 } })).toThrow(/unknown category/);
  });
  it("validateBenchmarkJudgement requires blindKey + difference classes", () => {
    const base = {
      itemId: "b1", judge: { kind: "vision-model" as const, id: "j" }, blindKey: "A-is-aura" as const,
      descriptions: { aura: "a", reference: "b" },
      differences: [{ text: "x", cls: "minor-aura3d-deficiency" as const, cause: "y" }],
      scores: { aura: 6, reference: 7 }, harnessFairness: { fair: true, notes: "" }
    };
    expect(validateBenchmarkJudgement(base).scores.aura).toBe(6);
    expect(() => validateBenchmarkJudgement({ ...base, differences: [{ text: "x", cls: "weird", cause: "y" }] })).toThrow(/cls/);
  });
  it("buildPacket is seeded-deterministic and never leaks the mapping in the prompt", () => {
    const p1 = buildPacket({ itemId: "i1", auraImage: "AAA", referenceImage: "BBB", seed: "round-7", kind: "benchmark" });
    const p2 = buildPacket({ itemId: "i1", auraImage: "AAA", referenceImage: "BBB", seed: "round-7", kind: "benchmark" });
    expect(p1.blindKey).toBe(p2.blindKey);
    expect(p1.imageA === "AAA").toBe(p1.blindKey === "A-is-aura");
    expect(p1.prompt).not.toContain("AAA");
  });
  it("computeDrift reports the max deviation from baseline", () => {
    expect(computeDrift({ a: 5, b: 7 }, { a: 4, b: 7.5 })).toBe(1);
    expect(computeDrift({ a: 4.2 }, { a: 4 })).toBeCloseTo(0.2);
  });
});

describe("classify-tools (research 14 §1.1)", () => {
  it("aggregator-only = reads reports, no browser, no pixels", () => {
    const dir = mkdtempSync(join(tmpdir(), "qg-tool-"));
    mkdirSync(join(dir, "agg"), { recursive: true });
    mkdirSync(join(dir, "runner"), { recursive: true });
    mkdirSync(join(dir, "pix"), { recursive: true });
    writeFileSync(join(dir, "agg", "index.ts"), `const r = JSON.parse(readFileSync("tests/reports/x.json"));\n`);
    writeFileSync(join(dir, "runner", "index.ts"), `import { chromium } from "playwright";\n`);
    writeFileSync(join(dir, "pix", "index.ts"), `import { PNG } from "pngjs";\n`);
    expect(classifyDir(join(dir, "agg")).classification).toBe("aggregator-only");
    expect(classifyDir(join(dir, "runner")).classification).toBe("runner");
    expect(classifyDir(join(dir, "pix")).classification).toBe("pixel-tool");
    expect(toFile([classifyDir(join(dir, "agg"))]).schema).toBe("aura3d.quality-gate.classification/1");
  });
});

// Silence unused-import lint surface for manifest typing used above.
export type { GoldenManifest };
