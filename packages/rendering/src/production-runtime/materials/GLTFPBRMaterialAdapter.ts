/**
 * E34 removal (PRD-04 P6-3 follow-through): this module only re-exported the
 * deleted `adaptGLTFMaterial`/`GLTFMaterialLike` stub under a PBR alias.
 * It now re-exports the real physical-material descriptor path, like
 * `GLTFMaterialAdapter.ts`, until Q-15-4 removes the barrel export lines.
 */
export { legacyPhysicalDescriptor } from "../../materials/PhysicalFeatures";
export type { LegacyPhysicalMaterialOptions } from "../../materials/PhysicalFeatures";
export type { PhysicalMaterialDescriptor } from "../../materials/PhysicalMaterial";
