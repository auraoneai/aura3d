import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGLTFCorpusReport, validateGLTFCorpusManifest, type GLTFCorpusManifest } from "../../packages/assets/src";

const manifestPath = resolve("tests/assets/corpus/gltf-100-classification.manifest.json");
const reportPath = resolve("tests/reports/gltf-100-classification.json");

describe("glTF 100 asset classification corpus", () => {
  it("classifies at least 100 pinned external GLB assets with source hashes", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as GLTFCorpusManifest & {
      readonly classificationScope?: string;
    };
    const validation = validateGLTFCorpusManifest(manifest);

    expect(validation.diagnostics).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.manifest?.assets.length).toBeGreaterThanOrEqual(100);
    expect(manifest.classificationScope).toContain("source classification evidence");
    expect(validation.manifest?.assets.every((asset) => asset.source.revision === manifest.generatedFrom.revision)).toBe(true);
    expect(validation.manifest?.assets.every((asset) => !asset.source.uri.includes("/main/"))).toBe(true);
    expect(validation.manifest?.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.source.sha256))).toBe(true);
    expect(new Set(validation.manifest?.assets.map((asset) => asset.id)).size).toBe(validation.manifest?.assets.length);

    const report = createGLTFCorpusReport(validation.manifest!, "2026-05-06T00:00:00.000Z");
    expect(report.sourceManifest.assetCount).toBe(100);
    expect(report.summary.pass + report.summary.warn + report.summary.expectedFail).toBe(100);
    expect(report.summary.pass).toBeGreaterThan(0);
    expect(report.summary.warn).toBeGreaterThan(0);
    expect(report.summary.expectedFail).toBe(0);
    expect(report.assets.find((asset) => asset.id === "abeautiful-game")?.diagnostics[0]).toMatchObject({
      code: "ASSET_100_CORPUS_CLASSIFICATION_WARNING",
      nextAction: expect.stringContaining("Run this asset through importer")
    });

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });
});
