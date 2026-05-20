import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

describe("master gate evidence", () => {
  it("documents objective production-ready gate evidence without implying production readiness", () => {
    const evidence = read("docs/project/v2-master-gate-evidence.md");

    for (const path of [
      "docs/project/browser-hardware-matrix.md",
      "docs/rendering/webgpu-hardware-matrix.md",
      "tests/reports/browser.json",
      "tests/reports/final-browser.json",
      "tests/reports/webgpu-hardware-matrix.json",
      "docs/assets/asset-corpus-report.md",
      "tests/reports/gltf-corpus.json",
      "docs/benchmarks/threejs-comparison.md",
      "docs/benchmarks/babylon-comparison.md",
      "tests/reports/comparison-threejs.json",
      "tests/reports/comparison-babylon.json",
      "docs/project/site-map.md",
      "docs/api/readme.md",
      "docs/api/public-api.md",
      "tests/reports/release-repeat.json",
      "tests/reports/final-release-verification.json",
      "docs/project/release-artifacts.json",
      "release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz",
      "tests/reports/versioned-release.json",
      "docs/project/support-policy.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      "docs/project/known-limits.md",
      "docs/project/v2-claim-registry.md"
    ]) {
      expect(existsSync(join(root, path)), `${path} should exist`).toBe(true);
      expect(evidence, `${path} should be referenced by master gate evidence`).toContain(path);
    }

    expect(evidence).toContain("does not assert production readiness");
    expect(evidence).toContain("not public npm registry publication");
    expect(evidence).toContain("not production readiness");
  });

  it("keeps comparison reports as scaffold evidence, not superiority evidence", () => {
    const threeReport = readJson<{
      ok: boolean;
      claimUsable: boolean;
      unsupportedByThisReport: string[];
      benchmarkMeasurementFailureLog: string[];
      artifacts: {
        screenshots: { status: string; paths: string[] };
        bundles: { status: string; paths: string[] };
        screenshotDiffs: { status: string; paths: string[] };
        renderedBenchmarkVisuals: { status: string; paths: string[] };
      };
    }>("tests/reports/comparison-threejs.json");
    const babylonReport = readJson<{
      ok: boolean;
      claimUsable: boolean;
      unsupportedByThisReport: string[];
      benchmarkMeasurementFailureLog: string[];
      artifacts: {
        screenshots: { status: string; paths: string[] };
        bundles: { status: string; paths: string[] };
        screenshotDiffs: { status: string; paths: string[] };
        renderedBenchmarkVisuals: { status: string; paths: string[] };
      };
    }>("tests/reports/comparison-babylon.json");

    for (const report of [threeReport, babylonReport]) {
      expect(report.ok).toBe(true);
      expect(report.claimUsable).toBe(false);
      expect(report.benchmarkMeasurementFailureLog).toEqual([]);
      expect(report.unsupportedByThisReport).not.toContain("real browser startup timing");
      expect(report.unsupportedByThisReport).not.toContain("real browser first-frame timing");
      expect(report.artifacts.bundles.status).toBe("built-browser-benchmark-bundles");
      expect(report.artifacts.bundles.paths.length).toBeGreaterThan(0);
      expect(report.artifacts.screenshots.status).toBe("captured-webgl2-microbenchmark-canvases");
      expect(report.artifacts.screenshots.paths.length).toBeGreaterThan(0);
      expect(report.artifacts.screenshotDiffs.status).toBe("computed-rendered-benchmark-scene-diffs");
      expect(report.artifacts.screenshotDiffs.paths.length).toBeGreaterThan(0);
      expect(report.artifacts.renderedBenchmarkVisuals.status).toBe("captured-descriptor-driven-rendered-benchmark-scenes");
      expect(report.artifacts.renderedBenchmarkVisuals.paths.length).toBeGreaterThan(0);
      expect(report.artifacts.screenshots.paths).toContain("tests/reports/comparison-threejs-audit.png");
      expect(report.artifacts.screenshots.paths).toContain("tests/reports/comparison-babylon-audit.png");
    }
  });

  it("checks the bounded browser/hardware and asset corpus reports", () => {
    const webgpuMatrix = readJson<{
      evidenceType: string;
      results: Array<{
        hasNavigatorGpu: boolean;
        adapterStatus: string;
        deviceStatus: string;
        unsupportedCases: string[];
      }>;
    }>("tests/reports/webgpu-hardware-matrix.json");
    const corpus = readJson<{
      sourceManifest: { assetCount: number; sourceRevision: string };
      summary: { pass: number; warn: number; expectedFail: number };
    }>("tests/reports/gltf-corpus.json");

    expect(webgpuMatrix.evidenceType).toBe("real-navigator-gpu-probe");
    expect(webgpuMatrix.results.length).toBeGreaterThan(0);
    expect(webgpuMatrix.results.every((result) => result.hasNavigatorGpu)).toBe(true);
    expect(webgpuMatrix.results.some((result) => result.adapterStatus === "available" && result.deviceStatus === "available")).toBe(true);
    expect(webgpuMatrix.results.every((result) =>
      (result.adapterStatus === "available" && result.deviceStatus === "available") ||
      (result.adapterStatus === "missing" &&
        result.deviceStatus === "not-requested" &&
        result.unsupportedCases.includes("navigator.gpu.requestAdapter returned null"))
    )).toBe(true);

    expect(corpus.sourceManifest.assetCount).toBeGreaterThanOrEqual(11);
    expect(corpus.sourceManifest.sourceRevision).toBe("2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf");
    expect(corpus.summary.pass + corpus.summary.warn + corpus.summary.expectedFail).toBe(corpus.sourceManifest.assetCount);
    expect(corpus.summary.expectedFail).toBe(0);
  });

  it("does not mark explicitly unproven production-ready rows", () => {
    const checklist = read("docs/project/v2-filename-level-execution-checklist.md");

    const releaseRepeat = readJson<{
      ok: boolean;
      hardGateRows: Array<{ row: number; proven: boolean; blockers: string[] }>;
    }>("tests/reports/release-repeat.json");
    expect(checklist).toContain("- [ ] External demos exist.");
    expect(checklist).toContain("- [x] Versioned package release exists.");
    expect(checklist).toContain("- [x] Independent clean-checkout reproduction succeeds on another machine or agent from documented commands.");
    expect(releaseRepeat.hardGateRows.map((row) => row.row).sort((a, b) => a - b)).toEqual([81, 686, 689, 692, 696]);
    for (const row of [689]) {
      const gate = releaseRepeat.hardGateRows.find((entry) => entry.row === row);
      expect(gate?.proven).toBe(false);
      expect(gate?.blockers.length).toBeGreaterThan(0);
    }
  });
});
