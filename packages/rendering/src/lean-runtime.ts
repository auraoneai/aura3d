/**
 * Browser-critical rendering surface for the lean agent entry point.
 *
 * Keep this file as direct module exports rather than forwarding through the broad rendering
 * barrel: the latter also exposes authoring, inspection, postprocess, WebGPU, and compatibility
 * families that are not required to draw the first scene.
 */
export { Geometry } from "./Geometry.js";
export { PBRMaterial } from "./PBRMaterial.js";
export { ProductionRuntimeRenderer } from "./production-runtime/ProductionRuntimeRenderer.js";
export { collectRenderItems } from "./Renderer.js";
export type { CameraLike, RenderSource } from "./Renderer.js";
export type { RenderItem } from "./ForwardPass.js";
export type {
  ProductionImportedAssetRenderMetadata,
  ProductionRendererInput
} from "./production-runtime/ProductionRendererTypes.js";
