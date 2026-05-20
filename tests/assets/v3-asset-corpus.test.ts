import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixtureRoot = resolve("fixtures/assets/v3");
const reportPath = resolve("tests/reports/v3-asset-corpus.json");
const gltfReportPath = resolve("tests/reports/v3-gltf-corpus.json");
const expectedCategories = ["product", "architecture", "character", "environment", "materials", "animation", "compression", "problem-cases"];

describe("v3 local asset corpus", () => {
  it("contains generated category fixtures with manifests, diagnostics baselines, and preview baselines", () => {
    for (const category of expectedCategories) {
      const categoryPath = resolve(fixtureRoot, category);
      expect(existsSync(categoryPath), `${categoryPath} missing`).toBe(true);
      const entries = readdirSync(categoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      expect(entries.length, `${category} should contain at least one fixture`).toBeGreaterThanOrEqual(1);
      for (const entry of entries) {
        const directory = resolve(categoryPath, entry.name);
        const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")) as {
          readonly schemaVersion: string;
          readonly category: string;
          readonly localFile: string;
          readonly features: readonly string[];
          readonly expectedUnsupportedFeatures: readonly string[];
          readonly screenshotBaseline: string;
          readonly loaderDiagnosticsBaseline: string;
        };
        expect(manifest.schemaVersion).toBe("g3d-v3-local-asset-v1");
        expect(manifest.category).toBe(category);
        expect(manifest.features.length).toBeGreaterThan(0);
        expect(existsSync(resolve(directory, manifest.localFile))).toBe(true);
        expect(existsSync(resolve(directory, manifest.screenshotBaseline))).toBe(true);
        expect(existsSync(resolve(directory, manifest.loaderDiagnosticsBaseline))).toBe(true);
      }
    }
  });

  it("emits a v3 asset corpus report with explicit expected errors instead of silent placeholders", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      readonly schemaVersion: string;
      readonly assetCount: number;
      readonly summary: {
        readonly renderResourcesCreated: number;
        readonly expectedError: number;
        readonly error: number;
      };
      readonly assets: readonly {
        readonly id: string;
        readonly renderStatus: string;
        readonly unsupportedFeatures: readonly string[];
        readonly contentEvidence: AssetContentEvidence;
        readonly timings: AssetCorpusTimings;
        readonly diagnostics: readonly { readonly code: string; readonly nextAction: string }[];
      }[];
    };

    expect(report.schemaVersion).toBe("g3d-v3-asset-corpus-report-v1");
    expect(report.assetCount).toBe(8);
    expect(report.summary).toEqual({ renderResourcesCreated: 7, expectedError: 1, error: 0 });
    expect(report.assets.find((asset) => asset.id === "compression-meshopt-required")).toMatchObject({
      renderStatus: "expected-error",
      unsupportedFeatures: ["meshopt-decoder-required"]
    });
    expect(report.assets.find((asset) => asset.id === "problem-multi-uv-render-limit")).toMatchObject({
      renderStatus: "render-resources-created",
      unsupportedFeatures: ["renderer-single-uv-set-per-draw"]
    });
    for (const asset of report.assets) {
      expectValidContentEvidence(asset.contentEvidence, asset.renderStatus);
      expectValidTiming(asset.timings);
    }
    expect(report.assets.flatMap((asset) => asset.diagnostics).every((diagnostic) => diagnostic.nextAction.length > 0)).toBe(true);
  });

  it("emits a glTF corpus report with features, unsupported features, render status, screenshots, and error state", () => {
    const report = JSON.parse(readFileSync(gltfReportPath, "utf8")) as {
      readonly schemaVersion: string;
      readonly assets: readonly {
        readonly id: string;
        readonly features: readonly string[];
        readonly unsupportedFeatures: readonly string[];
        readonly renderStatus: "render-resources-created" | "expected-error" | "error";
        readonly contentEvidence: AssetContentEvidence;
        readonly screenshotPath: string;
        readonly diagnosticsPath: string;
        readonly timings: AssetCorpusTimings;
        readonly errorState?: string;
      }[];
    };

    expect(report.schemaVersion).toBe("g3d-v3-asset-corpus-report-v1");
    expect(report.assets.length).toBeGreaterThan(0);
    for (const asset of report.assets) {
      expect(asset.id.length).toBeGreaterThan(0);
      expect(asset.features.length).toBeGreaterThan(0);
      expect(Array.isArray(asset.unsupportedFeatures)).toBe(true);
      expect(["render-resources-created", "expected-error", "error"]).toContain(asset.renderStatus);
      expectValidContentEvidence(asset.contentEvidence, asset.renderStatus);
      expectValidTiming(asset.timings);
      expect(asset.screenshotPath).toMatch(/^fixtures\/assets\/v3\/.+\/screenshot-baseline\.svg$/);
      expect(existsSync(resolve(asset.screenshotPath))).toBe(true);
      expect(existsSync(resolve(asset.diagnosticsPath))).toBe(true);
      if (asset.renderStatus === "expected-error" || asset.renderStatus === "error") {
        expect(asset.errorState?.length).toBeGreaterThan(0);
      } else {
        expect(asset.errorState).toBeUndefined();
      }
    }
  });
});

interface AssetCorpusTimings {
  readonly loadMs: number;
  readonly renderResourceMs: number;
  readonly decodeMs: number;
  readonly transcodeMs: number;
  readonly totalMs: number;
}

interface AssetContentEvidence {
  readonly decodedContent: boolean;
  readonly placeholder: false;
  readonly evidence: string;
}

function expectValidContentEvidence(evidence: AssetContentEvidence, renderStatus: string): void {
  expect(evidence.placeholder).toBe(false);
  expect(evidence.evidence.length).toBeGreaterThan(0);
  if (renderStatus === "render-resources-created") {
    expect(evidence.decodedContent).toBe(true);
    expect(evidence.evidence).toContain("createGLTFRenderResources");
  } else {
    expect(evidence.decodedContent).toBe(false);
    expect(evidence.evidence).not.toContain("successful placeholder");
  }
}

function expectValidTiming(timings: AssetCorpusTimings): void {
  expect(timings.loadMs).toBeGreaterThanOrEqual(0);
  expect(timings.renderResourceMs).toBeGreaterThanOrEqual(0);
  expect(timings.decodeMs).toBeGreaterThanOrEqual(0);
  expect(timings.transcodeMs).toBeGreaterThanOrEqual(0);
  expect(timings.totalMs).toBeGreaterThanOrEqual(timings.loadMs);
}
