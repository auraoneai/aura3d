/**
 * `@aura3d/engine/renderer` — PRD-15 §7.2 public subpath.
 * Includes every name dispositioned here from the "." surface
 * (docs/architecture/root-export-dispositions.json). Regenerate with
 * `tools/export-surface/scaffold.ts --write`.
 */

// §7.2 core surface — the one renderer and its frame/IO types.
export { Renderer } from "@aura3d/rendering";
export type { CameraLike, RenderDeviceDiagnostics, RenderItem, RendererInput, RendererOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, RendererAnimationLoop } from "@aura3d/rendering";
export type { RendererCreateOptions, RendererFrameResult, RendererLifecycle } from "@aura3d/rendering/contracts";

// Scene graph + material/geometry classes the compiler emits (§7.2 curated list).
export { Scene, SceneNode, Object3D, Group, Mesh, SkinnedMesh, InstancedMesh, PerspectiveCamera, OrthographicCamera, DirectionalLight, PointLight, SpotLight, Renderable } from "@aura3d/scene";
export type { MeshOptions, Object3DOptions, RenderableDescriptor } from "@aura3d/scene";
export { Geometry, Material, PBRMaterial, UnlitMaterial, TexturedPBRMaterial, TexturedUnlitMaterial, SkinnedLitMaterial, InstancedPBRMaterial, TextureBinding } from "@aura3d/rendering";
export type { RenderMaterial } from "@aura3d/rendering";

/** @deprecated 3.1.0, removed 4.0.0. Alias of Renderer. */
export { Renderer as A3DRenderer } from "@aura3d/rendering";
/** @deprecated 3.1.0, removed 4.0.0. Alias of RendererCreateOptions. */
export type { RendererCreateOptions as A3DRendererOptions } from "@aura3d/rendering/contracts";

export { A3DScene, analyzeRgbaFrameMotionRegions, createAnimationMaterialStyle, createAnimationRenderPreset, createECSRenderSource } from "../agent-api/index.js";
export type { A3DSceneMeshOptions, A3DSceneRenderSourceOptions, AnimationFrameVisualInput, AnimationFrameVisualQuality, AnimationMaterialStyle, AnimationMaterialStyleOptions, AnimationRenderPresetOptions, AnimationVisualQualityOptions, ECSRenderLibraries, ECSRenderSourceOptions, FrameBudgetDecision, FrameBudgetInput, FrameMotionRegion, FrameMotionRegionMetrics, ScatterPlan, ScatterPlanOptions } from "../agent-api/index.js";
