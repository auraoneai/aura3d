import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { listThreeCompatMaterialProofChannels, listThreeCompatPbrMaterials, THREE_COMPAT_REQUIRED_MATERIAL_CLASSES } from "./PBRMaterialLibrary";
import { findThreeCompatTextureSet, THREE_COMPAT_TEXTURE_SETS } from "./TextureSet";

export interface ThreeCompatMaterialLibrarySummary {
  readonly materialCount: number;
  readonly textureBackedMaterialCount: number;
  readonly textureSetCount: number;
  readonly checkedInTextureSetCount: number;
  readonly classes: readonly string[];
  readonly proofChannels: readonly string[];
  readonly missingRequiredClasses: readonly string[];
  readonly missingProofChannels: readonly string[];
  readonly missingTextureSetIds: readonly string[];
  readonly missingTextureSourcePaths: readonly string[];
}

export function summarizeThreeCompatMaterialLibrary(): ThreeCompatMaterialLibrarySummary {
  const materials = listThreeCompatPbrMaterials();
  const classes = [...new Set(materials.map((material) => material.class))].sort();
  const proofChannels = [...new Set(materials.flatMap((material) => material.proofChannels))].sort();
  const missingTextureSetIds = materials
    .filter((material) => material.textureSetId && !findThreeCompatTextureSet(material.textureSetId))
    .map((material) => material.id);
  const missingTextureSourcePaths = THREE_COMPAT_TEXTURE_SETS.filter((textureSet) => !existsSync(resolve(textureSet.sourcePath))).map((textureSet) => textureSet.sourcePath);
  return {
    materialCount: materials.length,
    textureBackedMaterialCount: materials.filter((material) => material.textureSetId).length,
    textureSetCount: THREE_COMPAT_TEXTURE_SETS.length,
    checkedInTextureSetCount: THREE_COMPAT_TEXTURE_SETS.length - missingTextureSourcePaths.length,
    classes,
    proofChannels,
    missingRequiredClasses: THREE_COMPAT_REQUIRED_MATERIAL_CLASSES.filter((materialClass) => !classes.includes(materialClass)),
    missingProofChannels: listThreeCompatMaterialProofChannels().filter((channel) => !proofChannels.includes(channel)),
    missingTextureSetIds,
    missingTextureSourcePaths
  };
}
