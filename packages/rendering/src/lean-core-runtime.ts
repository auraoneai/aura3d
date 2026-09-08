/**
 * Core-only browser rendering surface for `@aura3d/lean`.
 *
 * Product and broad renderer values remain on their existing entry points so
 * primitive scenes cannot statically download code they cannot call.
 */
export { Geometry } from "./Geometry.js";
export { PBRMaterial } from "./PBRMaterial.js";
export { LeanProductionRenderer } from "./lean/LeanProductionRenderer.js";
export type { LeanProductionRendererOptions } from "./lean/LeanProductionRenderer.js";
export type { CameraLike, RenderSource } from "./Renderer.js";
export type { RenderItem } from "./ForwardPass.js";
