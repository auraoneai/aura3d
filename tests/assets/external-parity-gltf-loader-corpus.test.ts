import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  summarizeExternalParityGLTFCorpus,
  validateExternalParityGLTFCorpusManifest,
  type ExternalParityGLTFCorpusManifest
} from "../../packages/assets/src";

describe("ExternalParity glTF corpus", () => {
  it("defines a 25+ asset corpus with license, provenance, and feature coverage", () => {
    const manifest = JSON.parse(readFileSync(resolve("fixtures/external-parity/gltf-corpus/manifest.json"), "utf8")) as ExternalParityGLTFCorpusManifest;
    validateExternalParityGLTFCorpusManifest(manifest);
    const summary = summarizeExternalParityGLTFCorpus(manifest);

    expect(summary.assetCount).toBeGreaterThanOrEqual(25);
    expect(summary.visualEvidenceSlots).toBeGreaterThanOrEqual(12);
    expect(summary.advancedMaterialAssets).toBeGreaterThanOrEqual(5);
    expect(summary.animationSkinMorphAssets).toBeGreaterThanOrEqual(2);
    expect(summary.featureCoverage).toEqual(expect.arrayContaining(["pbr", "texture", "extension", "animation", "skinning", "morph-target"]));
    expect(summary.releaseProofComplete).toBe(false);
  });
});
