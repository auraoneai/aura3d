/**
 * RenderSource — moved verbatim from Renderer.ts:246-292 per §3.3, re-exported
 * from Renderer.ts. PR 0a adds the flag-off sentinel/fog/environment carry-overs
 * the post split needs (declaration-only optional fields).
 */

import type { Scene, Bounds3 as SceneBounds3 } from "@aura3d/scene";
import type { RenderTarget } from "../RenderDevice";
import type { Geometry } from "../Geometry";
import type { RenderMaterial, EnvironmentLightingOptions, ForwardEnvironmentFogOptions, ForwardShadowMapOptions } from "../ForwardPass";
import type { MorphTargetDelta } from "../MorphTarget";
import type { RenderItem } from "./renderItem";
import type { EnvironmentBackgroundOptions } from "../EnvironmentBackgroundPass";
import type { StaticBatchOptions } from "../SceneOptimization";
import type { MeshConsolidationOptions } from "../MeshConsolidation";
import type { CollectedLight } from "../LightCollector";
import type {
  RendererCameraPolicy,
  RendererCameraFrameOptions,
  RendererCameraProjection,
  RendererPostProcessOptions,
  RenderResourceLookup,
  RendererShadowOptions
} from "../Renderer";

export interface RenderSource {
  collectRenderItems?(): Iterable<RenderItem>;
  readonly renderItems?: Iterable<RenderItem>;
  readonly scene?: Scene;
  readonly renderTarget?: RenderTarget;
  readonly cameraPolicy?: RendererCameraPolicy;
  readonly cameraFrameBounds?: SceneBounds3 | {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly cameraFrameOptions?: RendererCameraFrameOptions;
  /**
   * Projection used when the renderer frames the scene itself.
   *
   * Defaults to `"perspective"`, which is what auto-framing has always
   * produced. Set `"orthographic"` for views defined by the absence of
   * foreshortening — CAD and technical drawings, isometric gameplay, floor
   * plans, sprite bakes, product turntables — where a perspective frustum
   * renders a visibly different image from the one the scene describes.
   */
  readonly cameraProjection?: RendererCameraProjection;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly environmentBackground?: EnvironmentBackgroundOptions | false;
  readonly environmentLighting?: EnvironmentLightingOptions | false;
  readonly environmentFog?: ForwardEnvironmentFogOptions | false;
  readonly shadowMap?: ForwardShadowMapOptions;
  readonly shadow?: RendererShadowOptions | boolean;
  readonly postprocess?: RendererPostProcessOptions | boolean;
  readonly cameraPosition?: readonly [number, number, number];
  readonly geometryLibrary?: RenderResourceLookup<Geometry>;
  readonly materialLibrary?: RenderResourceLookup<RenderMaterial>;
  readonly morphTargetLibrary?: RenderResourceLookup<readonly MorphTargetDelta[]>;
  readonly frustumCulling?: boolean;
  readonly staticBatching?: boolean | StaticBatchOptions;
  /**
   * Merge distinct static geometries that share a material into single buffers.
   *
   * Complements `staticBatching`, which instances one geometry many times and therefore cannot help
   * when every mesh owns unique geometry — the normal case for architecture exported from level
   * editors. Consolidation bakes each source model matrix into vertex positions, so it is only valid
   * for geometry that never moves, deforms, or needs independent culling.
   *
   * Applied before batching, so any geometry left unmerged can still be instanced.
   */
  readonly staticMeshConsolidation?: boolean | MeshConsolidationOptions;
}
