import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSET_IMPORT_SETTINGS,
  createGLTFCorpusReport,
  normalizeAssetImportSettings,
  validateGLTFCorpusManifest,
  type GLTFCorpusManifest
} from "../../packages/assets/src";

const manifestPath = resolve("tests/assets/corpus/gltf-corpus.manifest.json");
const reportPath = resolve("tests/reports/gltf-corpus.json");
const knownLimitsPath = resolve("docs/known-limits.md");

describe("glTF external corpus manifest", () => {
  it("validates pinned external asset entries and emits a current corpus report", () => {
    const manifest = readManifest();
    const validation = validateGLTFCorpusManifest(manifest);

    expect(validation.diagnostics).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.manifest?.assets.length).toBe(17);
    expect(validation.manifest?.assets.every((asset) => !asset.source.uri.includes("/main/"))).toBe(true);
    expect(validation.manifest?.assets.every((asset) => asset.source.revision === manifest.generatedFrom.revision)).toBe(true);
    expect(validation.manifest?.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.source.sha256))).toBe(true);

    const report = createGLTFCorpusReport(validation.manifest!, new Date().toISOString());
    expect(report.summary).toEqual({ pass: 11, warn: 4, expectedFail: 2 });
    expect(report.assets.find((asset) => asset.id === "meshopt-cube-test")?.diagnostics[0]).toMatchObject({
      assetId: "meshopt-cube-test",
      code: "ASSET_MESHOPT_DECODER_REQUIRED",
      nextAction: expect.stringContaining("Meshopt")
    });

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  it("rejects unpinned or unactionable corpus entries", () => {
    const manifest = readManifest();
    const bad = {
      ...manifest,
      assets: [
        {
          ...manifest.assets[0],
          source: {
            ...manifest.assets[0]!.source,
            uri: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Binary/Box.glb"
          }
        },
        {
          ...manifest.assets.find((asset) => asset.expectedStatus === "expected-fail")!,
          id: "broken-expected-fail",
          expectedDiagnostics: []
        }
      ]
    };

    const validation = validateGLTFCorpusManifest(bad);

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "ASSET_CORPUS_SOURCE_UNPINNED_URI",
      "ASSET_CORPUS_EXPECTED_FAIL_DIAGNOSTIC"
    ]));
    expect(validation.diagnostics.every((entry) => entry.nextAction.length > 0)).toBe(true);
  });

  it("normalizes import settings for material and texture pipeline decisions", () => {
    expect(normalizeAssetImportSettings({ colorSpace: "srgb", compression: "prefer-source", scale: 0.01 })).toEqual({
      ...DEFAULT_ASSET_IMPORT_SETTINGS,
      colorSpace: "srgb",
      compression: "prefer-source",
      scale: 0.01
    });

    expect(() => normalizeAssetImportSettings({ scale: 0 })).toThrow(/scale/);
    expect(() => normalizeAssetImportSettings({ colorSpace: "display-p3" as never })).toThrow(/colorSpace/);
  });

  it("documents every expected-fail corpus diagnostic in known limits", () => {
    const manifest = readManifest();
    const report = createGLTFCorpusReport(manifest, "2026-05-06T00:00:00.000Z");
    const knownLimits = readFileSync(knownLimitsPath, "utf8");
    const expectedFailures = report.assets.filter((asset) => asset.expectedStatus === "expected-fail");

    expect(expectedFailures.length).toBe(2);
    for (const asset of expectedFailures) {
      expect(asset.diagnostics.length).toBeGreaterThan(0);
      expect(knownLimits).toContain(asset.id);
      for (const diagnostic of asset.diagnostics) {
        expect(diagnostic.assetId).toBe(asset.id);
        expect(diagnostic.nextAction.trim().length).toBeGreaterThan(0);
        expect(knownLimits).toContain(diagnostic.code);
      }
    }
  });
});

function readManifest(): GLTFCorpusManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as GLTFCorpusManifest;
}
