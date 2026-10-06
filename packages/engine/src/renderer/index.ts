/**
 * `@aura3d/engine/renderer` — the one-renderer public surface (PRD-15 §7.2).
 *
 * Transitional shape: everything the `renderer-imports` codemod rewrites to,
 * so codemod output compiles today — `Renderer` plus the deprecated aliases
 * (`A3DRenderer`, `AdvancedRenderer`, `ProductionWebGL2Renderer`,
 * `ProductionRuntimeRenderer`) that Phase 8 removes. The curated §7.2 list
 * (materials/geometry the compiler emits, evidence-regex split to
 * `./devtools`) narrows this in Phase 5.
 */

export { Renderer } from "@aura3d/rendering";
export {
  rendererProofCapture,
  rendererFeatureReport,
  rendererInteractiveFeatureReport,
  rendererShadowReport,
  validateProductionRendererInput,
  resolveProductionRuntimeRendererBackend
} from "@aura3d/rendering";
export type {
  CameraLike,
  RenderDeviceDiagnostics,
  RenderItem,
  RendererInput,
  RendererOptions,
  RenderSource,
  ResizeToDisplayOptions,
  ResizeToDisplayResult,
  RendererAnimationLoop,
  RendererFrameCaptureWithMetadata,
  ProductionRendererBackend,
  ProductionRendererFeature,
  ProductionRendererFeatureState,
  ProductionRendererInput,
  ProductionRenderProof,
  ProductionRuntimeRendererBackendPreference,
  ProductionRuntimeRendererBackendSelection,
  ProductionRuntimeRendererOptions,
  ProductionWebGL2RendererOptions,
  RuntimeParityFrameRenderResult,
  ScenePickHit,
  ScenePickOptions
} from "@aura3d/rendering";
export type { RendererCreateOptions, RendererFrameResult, RendererLifecycle } from "@aura3d/rendering";

/** @deprecated PRD-15 T2.9 — alias of `Renderer`; removed in 4.0.0. */
export { A3DRenderer } from "../advanced-runtime/A3DRenderer.js";
/** @deprecated PRD-15 T2.9 — alias of `RendererOptions`; removed in 4.0.0. */
export type { A3DRendererOptions } from "../advanced-runtime/A3DRenderer.js";
/** @deprecated PRD-15 T2.7 — alias of `Renderer`; removed in 4.0.0. */
export { Renderer as AdvancedRenderer } from "@aura3d/rendering";
/** @deprecated PRD-15 T2.7 — alias of `RendererOptions`; removed in 4.0.0. */
export type { RendererOptions as AdvancedRendererOptions } from "@aura3d/rendering";
/** @deprecated PRD-15 T2.6 — alias of `Renderer`; removed in 4.0.0. */
export { Renderer as ProductionWebGL2Renderer, Renderer as ProductionRuntimeRenderer } from "@aura3d/rendering";
export type { AdvancedRendererSource } from "@aura3d/rendering";

export { a3dRenderFrame, a3dRenderFrameAsync } from "../advanced-runtime/a3dCompat.js";
export { a3dRenderResult } from "../production-runtime/index.js";

export { A3DScene } from "../advanced-runtime/A3DScene.js";
export type { A3DSceneMeshOptions, A3DSceneRenderSourceOptions } from "../advanced-runtime/A3DScene.js";
export { createECSRenderSource } from "../ecs/ECSRenderSource.js";

export {
  Scene,
  SceneNode,
  Object3D,
  Group,
  Mesh,
  SkinnedMesh,
  InstancedMesh,
  PerspectiveCamera,
  OrthographicCamera,
  DirectionalLight,
  PointLight,
  SpotLight,
  Renderable
} from "@aura3d/scene";
export type { MeshOptions, Object3DOptions, RenderableDescriptor } from "@aura3d/scene";

export {
  Geometry,
  Material,
  PBRMaterial,
  UnlitMaterial,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  SkinnedLitMaterial,
  InstancedPBRMaterial,
  TextureBinding
} from "@aura3d/rendering";
export type { RenderMaterial } from "@aura3d/rendering";
