import { describe, expect, it } from "vitest";
import {
  createV5MaterialPreviewScene,
  listV5MaterialProofChannels,
  listV5PbrMaterials,
  summarizeV5MaterialLibrary,
  V5_REQUIRED_MATERIAL_CLASSES
} from "../../../packages/materials/src";

describe("V5 PBR material library", () => {
  it("covers the required production material classes, texture sets, and proof channels", () => {
    const materials = listV5PbrMaterials();
    const summary = summarizeV5MaterialLibrary();
    const previewScene = createV5MaterialPreviewScene();

    expect(materials.length).toBeGreaterThanOrEqual(50);
    expect(summary.textureBackedMaterialCount).toBeGreaterThanOrEqual(25);
    expect(summary.checkedInTextureSetCount).toBeGreaterThanOrEqual(25);
    expect(summary.missingRequiredClasses).toEqual([]);
    expect(summary.missingProofChannels).toEqual([]);
    expect(summary.missingTextureSetIds).toEqual([]);
    expect(summary.missingTextureSourcePaths).toEqual([]);
    expect(summary.classes).toEqual(expect.arrayContaining([...V5_REQUIRED_MATERIAL_CLASSES]));
    expect(summary.proofChannels).toEqual(expect.arrayContaining([...listV5MaterialProofChannels()]));
    expect(previewScene).toHaveLength(materials.length);
    expect(previewScene.some((tile) => tile.previewGeometry === "thin-glass")).toBe(true);
    expect(previewScene.some((tile) => tile.previewGeometry === "foliage-card")).toBe(true);
  });
});
