import type { ThreeCompatLightDescriptor } from "./LightingSystem";
import type { ThreeCompatMaterialMode } from "./MaterialSystem";

export interface ThreeCompatSceneRenderPlan {
  readonly cameras: readonly ("perspective" | "orthographic" | "cube-environment")[];
  readonly lights: readonly ThreeCompatLightDescriptor[];
  readonly materialModes: readonly ThreeCompatMaterialMode[];
  readonly renderPasses: readonly string[];
  readonly sceneComplexity: {
    readonly meshes: number;
    readonly instances: number;
    readonly skinnedMeshes: number;
    readonly transparentObjects: number;
    readonly postprocessPasses: number;
  };
}

export class ThreeCompatSceneRenderer {
  createComplexScenePlan(lights: readonly ThreeCompatLightDescriptor[], materialModes: readonly ThreeCompatMaterialMode[]): ThreeCompatSceneRenderPlan {
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
