export {
  findThreeCompatPbrMaterial,
  listThreeCompatMaterialProofChannels,
  listThreeCompatPbrMaterials,
  THREE_COMPAT_PBR_MATERIAL_LIBRARY,
  THREE_COMPAT_REQUIRED_MATERIAL_CLASSES
} from "./PBRMaterialLibrary";
export { findGameReadyMaterial, GAME_READY_MATERIAL_IDS, GAME_READY_MATERIAL_PRESETS, listGameReadyMaterials } from "./GameReadyMaterialLibrary";
export type { GameReadyMaterialKind, GameReadyMaterialPreset, GameReadyMaterialProbe, GameReadyMaterialTunable } from "./GameReadyMaterialLibrary";
export { findThreeCompatTextureSet, THREE_COMPAT_TEXTURE_SETS } from "./TextureSet";
export { createThreeCompatMaterialPreviewScene, createThreeCompatMaterialPreviewTile } from "./MaterialPreviewScene";
export type {
  ThreeCompatMaterialClass,
  ThreeCompatMaterialParameters,
  ThreeCompatMaterialPreset,
  ThreeCompatMaterialProofChannel
} from "./MaterialPreset";
export type {
  ThreeCompatTextureMapReference,
  ThreeCompatTextureSemantic,
  ThreeCompatTextureSet
} from "./TextureSet";
export type { ThreeCompatMaterialPreviewTile } from "./MaterialPreviewScene";
export * from "./MaterialPresets.js";
export * from "./NodeMaterial.js";
