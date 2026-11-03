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

// threejs-parity SH-02/SH-10 (docs/workflows/threejs-parity-gaps.md §5.0, lane
// L1): `material.custom(spec)` compiles to `PortableShaderMaterial`; the public
// mutable `#include` registry is `registerShaderChunk(name, glsl, wgsl?)` —
// distinct from the contract-level `ShaderChunk` object registry in
// `@aura3d/rendering/contracts` (which stamps name/owner/stage metadata).
export { PortableShaderMaterial, ShaderPreprocessor, registerShaderChunk } from "@aura3d/rendering";
export type { PortableShaderSources, PortableShaderStagePair, PortableShaderUniform, PortableShaderMaterialOptions } from "@aura3d/rendering";
export type { RenderTarget, RenderTargetDescriptor } from "@aura3d/rendering";
// 5.0.0: `Texture` / `Sampler` are values here (procedural IBL and texture authoring), replacing the
// removed `@aura3d/engine/rendering` subpath for templates.
export { Texture, Sampler } from "@aura3d/rendering";
// SH-06 (R-06): value-level render-target factory; `render({ target })` is the consumer.
export { createRenderTarget } from "./renderTarget.js";

/** @deprecated 3.1.0, removed 4.0.0. Alias of Renderer. */
export { Renderer as A3DRenderer } from "@aura3d/rendering";
/**
 * @deprecated 3.1.0, removed 4.0.0. Frame helpers the `renderer-imports` codemod
 * points callers at (13 showcase apps import them from this subpath).
 */
export { a3dRenderFrame, a3dRenderFrameAsync } from "../advanced-runtime/a3dCompat.js";
/** @deprecated 3.1.0, removed 4.0.0. Alias of RendererCreateOptions. */
export type { RendererCreateOptions as A3DRendererOptions } from "@aura3d/rendering/contracts";

export { A3DScene, analyzeRgbaFrameMotionRegions, createAnimationMaterialStyle, createAnimationRenderPreset, createECSRenderSource } from "../agent-api/index.js";
export type { A3DSceneMeshOptions, A3DSceneRenderSourceOptions, AnimationFrameVisualInput, AnimationFrameVisualQuality, AnimationMaterialStyle, AnimationMaterialStyleOptions, AnimationRenderPresetOptions, AnimationVisualQualityOptions, ECSRenderLibraries, ECSRenderSourceOptions, FrameBudgetDecision, FrameBudgetInput, FrameMotionRegion, FrameMotionRegionMetrics, ScatterPlan, ScatterPlanOptions } from "../agent-api/index.js";

// 5.0.0: the engine production-runtime SDK (product viewer, glTF/HDR loaders, studio lighting,
// typed GLB actors, game render presets and the performance governor). Its former subpath
// `@aura3d/engine/production-runtime` was deprecated in 4.0.0 with this entry as the destination
// and was removed in 5.0.0 (docs/migration/4-to-5.md, B15).
export * from "../production-runtime/index.js";

// 5.0.0: stylized (cel) rendering and collected-light types the animation-studio template used
// through the removed `@aura3d/engine/rendering` subpath.
export { AnimationToonMaterial, quantizeToonBand } from "@aura3d/rendering";
export type { CollectedLight } from "@aura3d/rendering";
