import type { V5LightDescriptor } from "./LightingSystem";
import type { V5MaterialMode } from "./MaterialSystem";

export interface V5SceneRenderPlan {
  readonly cameras: readonly ("perspective" | "orthographic" | "cube-environment")[];
  readonly lights: readonly V5LightDescriptor[];
  readonly materialModes: readonly V5MaterialMode[];
  readonly renderPasses: readonly string[];
  readonly sceneComplexity: {
    readonly meshes: number;
    readonly instances: number;
    readonly skinnedMeshes: number;
    readonly transparentObjects: number;
    readonly postprocessPasses: number;
  };
}

export class V5SceneRenderer {
  createComplexScenePlan(lights: readonly V5LightDescriptor[], materialModes: readonly V5MaterialMode[]): V5SceneRenderPlan {
    return {
      cameras: ["perspective", "orthographic", "cube-environment"],
      lights,
      materialModes,
      renderPasses: ["depth-prepass", "shadow-atlas", "opaque-forward", "transmission-prepass", "transparent-forward", "tone-map", "capture"],
      sceneComplexity: {
        meshes: 72,
        instances: 12000,
        skinnedMeshes: 4,
        transparentObjects: 18,
        postprocessPasses: 3
      }
    };
  }
}
