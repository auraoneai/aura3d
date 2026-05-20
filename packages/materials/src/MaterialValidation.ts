import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { listV5MaterialProofChannels, listV5PbrMaterials, V5_REQUIRED_MATERIAL_CLASSES } from "./PBRMaterialLibrary";
import { findV5TextureSet, V5_TEXTURE_SETS } from "./TextureSet";

export interface V5MaterialLibrarySummary {
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

export function summarizeV5MaterialLibrary(): V5MaterialLibrarySummary {
  const materials = listV5PbrMaterials();
  const classes = [...new Set(materials.map((material) => material.class))].sort();
  const proofChannels = [...new Set(materials.flatMap((material) => material.proofChannels))].sort();
  const missingTextureSetIds = materials
    .filter((material) => material.textureSetId && !findV5TextureSet(material.textureSetId))
    .map((material) => material.id);
  const missingTextureSourcePaths = V5_TEXTURE_SETS.filter((textureSet) => !existsSync(resolve(textureSet.sourcePath))).map((textureSet) => textureSet.sourcePath);
  return {
    materialCount: materials.length,
    textureBackedMaterialCount: materials.filter((material) => material.textureSetId).length,
    textureSetCount: V5_TEXTURE_SETS.length,
    checkedInTextureSetCount: V5_TEXTURE_SETS.length - missingTextureSourcePaths.length,
    classes,
    proofChannels,
    missingRequiredClasses: V5_REQUIRED_MATERIAL_CLASSES.filter((materialClass) => !classes.includes(materialClass)),
    missingProofChannels: listV5MaterialProofChannels().filter((channel) => !proofChannels.includes(channel)),
    missingTextureSetIds,
    missingTextureSourcePaths
  };
}
