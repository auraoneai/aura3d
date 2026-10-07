/**
 * E34 removal (PRD-04 P6-3): the `adaptGLTFMaterial`/`GLTFMaterialLike` stub —
 * a CPU single-sample adapter that pretended to lower glTF materials — was
 * deleted. The module stays as a thin re-export of the real physical-material
 * descriptor path so the owner-01 barrel (`production-runtime/index.ts`) and
 * the production-runtime file manifest keep resolving until Q-15-4 removes
 * this export line. The working glTF→material path is `GLTFRenderResources`
 * + `materials/PhysicalFeatures`.
 */
export { legacyPhysicalDescriptor } from "../../materials/PhysicalFeatures";
export type { LegacyPhysicalMaterialOptions } from "../../materials/PhysicalFeatures";
export type { PhysicalMaterialDescriptor } from "../../materials/PhysicalMaterial";
