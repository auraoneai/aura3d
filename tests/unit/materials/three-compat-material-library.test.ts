import { describe, expect, it } from "vitest";
import {
  createThreeCompatMaterialPreviewScene,
  listThreeCompatMaterialProofChannels,
  listThreeCompatPbrMaterials,
  summarizeThreeCompatMaterialLibrary,
  THREE_COMPAT_REQUIRED_MATERIAL_CLASSES
} from "../../../packages/materials/src";

describe("ThreeCompat PBR material library", () => {
  it("covers the required production material classes, texture sets, and proof channels", () => {
    const materials = listThreeCompatPbrMaterials();
    const summary = summarizeThreeCompatMaterialLibrary();
    const previewScene = createThreeCompatMaterialPreviewScene();

    expect(materials.length).toBeGreaterThanOrEqual(50);
    expect(summary.textureBackedMaterialCount).toBeGreaterThanOrEqual(25);
    expect(summary.checkedInTextureSetCount).toBeGreaterThanOrEqual(25);
    expect(summary.missingRequiredClasses).toEqual([]);
    expect(summary.missingProofChannels).toEqual([]);
    expect(summary.missingTextureSetIds).toEqual([]);
    expect(summary.missingTextureSourcePaths).toEqual([]);
    expect(summary.classes).toEqual(expect.arrayContaining([...THREE_COMPAT_REQUIRED_MATERIAL_CLASSES]));
    expect(summary.proofChannels).toEqual(expect.arrayContaining([...listThreeCompatMaterialProofChannels()]));
    expect(previewScene).toHaveLength(materials.length);
    expect(previewScene.some((tile) => tile.previewGeometry === "thin-glass")).toBe(true);
    expect(previewScene.some((tile) => tile.previewGeometry === "foliage-card")).toBe(true);
  });
});
