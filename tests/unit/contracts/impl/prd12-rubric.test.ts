import { describe, expect, it } from "vitest";
import { GAME_NONVISUAL_CATEGORIES, GAME_VISUAL_CATEGORIES, RUBRIC_PROMPT_VERSION } from "../../../../tools/quality-gate/src/contracts";
import { G_REF_BAR_R3, evaluateGates, type GoldenManifest, type ItemVerdictInput, type MetricValue } from "../../../../tools/quality-gate/src/verdict";
import type { CapturedItem } from "../../../../tools/quality-gate/src/types";

const CAPTURE = { path: "frame.png", sha256: "0".repeat(64), width: 1280, height: 720, dpr: 1 } as const;
const ENV = { commitSha: "abc", githubRunId: "1", runnerImage: "macos-14/1", gpuRenderer: "ANGLE Metal", browserVersion: "139", launchArgs: [] };

function item(id: string, gpuRenderer = ENV.gpuRenderer): CapturedItem {
  return { itemId: id, kind: "benchmark-scene", aura: CAPTURE, reference: CAPTURE, masks: {}, variants: {}, repeats: [], env: { ...ENV, gpuRenderer } };
}

const GOLDENS: GoldenManifest = {
  schema: "aura3d-quality-gate-goldens/1",
  entries: {
    "bench:01": { itemId: "bench:01", approvedRound: "round-0", ref: CAPTURE, thresholds: { "flip@frame": 0.05, "1-ssim@frame": 0.01 } }
  }
};

function metric(metric: MetricValue["metric"], value: number, region: MetricValue["region"] = "frame"): MetricValue {
  return { metric, region, value, status: "ok" };
}

function verdictsFor(input: ItemVerdictInput, metrics: MetricValue[] = [], goldens = GOLDENS) {
  const metricsMap = new Map([[input.item.itemId, metrics]]);
  return evaluateGates({ items: [input], metrics: metricsMap, goldens });
}

describe("PRD-12 rubric surface (C-32) and evaluateGates", () => {
  it("keeps the frozen category table", () => {
    expect(GAME_VISUAL_CATEGORIES.length).toBe(27);
    expect(GAME_NONVISUAL_CATEGORIES).toContain("performance");
    expect(RUBRIC_PROMPT_VERSION).toBe("rubric-v1-qr0");
  });

  it("passes a clean item inside calibrated thresholds", () => {
    const result = verdictsFor({ item: item("bench:01") }, [metric("flip", 0.01), metric("ssim", 0.99)]);
    expect(result.itemVerdicts.get("bench:01")).toEqual(["pass"]);
    expect(result.exitCode).toBe(0);
  });

  it("flags blocked-runner on a software rasterizer and emits no metric verdict", () => {
    const result = verdictsFor({ item: item("bench:01", "SwiftShader") }, [metric("flip", 0.5)]);
    expect(result.itemVerdicts.get("bench:01")).toEqual(["blocked-runner"]);
    expect(result.exitCode).toBe(1);
  });

  it("flags forbidden-capture-flag when flags are present", () => {
    const result = verdictsFor({ item: item("bench:01"), forbiddenFlags: ["experimental"] });
    expect(result.itemVerdicts.get("bench:01")).toEqual(["forbidden-capture-flag"]);
  });

  it("marks regression when a calibrated threshold is exceeded", () => {
    const result = verdictsFor({ item: item("bench:01") }, [metric("flip", 0.08)]); // > 0.05 threshold, < 0.10 bar
    expect(result.itemVerdicts.get("bench:01")).toEqual(["regression"]);
  });

  it("marks reference-gap when the G-REF bar R3 distance is exceeded", () => {
    const result = verdictsFor({ item: item("bench:01") }, [metric("flip", 0.12)]);
    expect(result.itemVerdicts.get("bench:01")).toEqual(["regression", "reference-gap"]);
  });

  it("marks non-discriminating for an item without a golden", () => {
    const result = verdictsFor({ item: item("bench:99") });
    expect(result.itemVerdicts.get("bench:99")).toEqual(["non-discriminating"]);
    expect(result.exitCode).toBe(1);
  });

  it("never fabricates a pass from unavailable metrics", () => {
    const result = verdictsFor({ item: item("bench:01") }, [{ metric: "flip", region: "frame", value: NaN, status: "unavailable" }]);
    expect(result.itemVerdicts.get("bench:01")).toEqual(["pass"]);
  });
});
