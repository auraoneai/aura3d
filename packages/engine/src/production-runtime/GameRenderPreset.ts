import type {
  EnvironmentLightingOptions,
  PerspectiveCameraFrameOptions,
  RenderSource,
  RendererPostProcessOptions,
  RendererShadowOptions
} from "@aura3d/rendering";

export interface SideViewGameRenderPreset {
  readonly kind: "aura-side-view-game-render-preset";
  readonly cameraPolicy: RenderSource["cameraPolicy"];
  readonly cameraFrameOptions: PerspectiveCameraFrameOptions;
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly environmentFog: NonNullable<RenderSource["environmentFog"]>;
  readonly stageGeometry: SideViewGameStageGeometryPreset;
  readonly particles: SideViewGameParticlePreset;
  readonly debugOverlays: SideViewGameDebugOverlayPreset;
  readonly shadow: RendererShadowOptions;
  readonly postprocess: RendererPostProcessOptions;
  readonly performanceBudget: SideViewGamePerformanceBudget;
  readonly debugVolumesEnabled: boolean;
}

/**
 * The frame budget that admits exactly the features this preset enables.
 *
 * The preset previously declared shadows, bloom, colour grading, fog and 128 particles without
 * declaring what any of it was allowed to cost, so the numbers admitting those features lived as
 * literals in three unrelated places: the consuming route's `createPerformanceProof`
 * (`frameTimeMs <= 16.7 && fps >= 55 && drawCalls <= 160`) and again in
 * `performance-budget.spec.ts`. A feature could be enabled here while the budget proving it
 * affordable drifted somewhere else.
 *
 * `enabledFeatures` is the important field: it is the explicit list of passes this budget was measured
 * *with*. It exists so the reverse mistake is visible too -- enabling a feature merely to make
 * diagnostics report it, without re-measuring, now means the enabled set and the budget disagree.
 */
export interface SideViewGamePerformanceBudget {
  /** Frame-time ceiling for a 60fps-class route, in milliseconds. */
  readonly maxFrameTimeMs: number;
  /** Sustained-FPS floor, allowing a small margin under 60 for headless capture jitter. */
  readonly minFps: number;
  /**
   * Draw-call ceiling.
   *
   * Sized for a side-view stage carrying two skinned GLB fighters plus a consolidated multi-building
   * typed arena. Aura Clash measures **91** against this with the textured downtown arena, shadows and
   * postprocess all active.
   */
  readonly maxDrawCalls: number;
  /** The renderer passes this budget was measured with, so an unmeasured addition is detectable. */
  readonly enabledFeatures: readonly SideViewGameBudgetedFeature[];
}

export type SideViewGameBudgetedFeature =
  | "shadow-map"
  | "bloom"
  | "color-grade"
  | "environment-fog"
  | "environment-lighting"
  | "ambient-particles"
  | "skinned-glb-fighters"
  | "consolidated-typed-arena";

export interface SideViewGameRenderPresetOptions {
  readonly debugVolumesEnabled?: boolean;
  readonly reducedMotion?: boolean;
}

export interface SideViewGameStageGeometryPreset {
  readonly floor: {
    readonly label: string;
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly materialRole: "gameplay-floor";
    readonly receiveShadow: true;
  };
  readonly rearRim: {
    readonly label: string;
    readonly center: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly materialRole: "arena-rim";
  };
  readonly laneBounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
}

export interface SideViewGameParticlePreset {
  readonly enabled: boolean;
  readonly layerId: "arena-ambient-particles";
  readonly count: number;
  readonly reducedMotionCount: number;
  readonly colors: readonly string[];
  readonly normalPassOnly: true;
}

export interface SideViewGameDebugOverlayPreset {
  readonly enabled: boolean;
  readonly normalPassVisible: false;
  readonly collisionVolumeKinds: readonly ("hitbox" | "hurtbox" | "guardbox" | "pushbox")[];
  readonly label: "collision-volumes";
}

export function createSideViewGameRenderPreset(
  options: SideViewGameRenderPresetOptions = {}
): SideViewGameRenderPreset {
  const reducedMotion = Boolean(options.reducedMotion);
  return {
    kind: "aura-side-view-game-render-preset",
    cameraPolicy: "auto-frame",
    cameraFrameOptions: {
      yawRadians: 0,
      pitchRadians: -0.06,
      paddingRatio: 0.1,
      nearPadding: 0.24,
      // The far plane is derived from the *framed* bounds, which deliberately contain only the
      // gameplay subjects -- a large backdrop opts out of auto-framing so it cannot drag the frame
      // volume out and push the subjects off-screen. But excluding it from framing also excluded it
      // from the depth range: at 1.8 the far plane landed ~6.6 units out while the Aura Clash arena
      // backdrop sits 6.7-9.0 units from the camera, so the typed arena was submitted every frame
      // and then clipped in its entirety. It rendered nothing even with a fully emissive material,
      // and only appeared once moved in front of the fighters -- which is how the clip was isolated.
      //
      // Padding a side-view stage generously costs depth precision, not draws: the geometry was
      // already being submitted. 12 keeps a backdrop several times deeper than the fight plane
      // inside the frustum while staying far below the 100-unit default projection range.
      farPadding: 12
    },
    environmentLighting: {
      color: [0.58, 0.7, 0.82],
      intensity: 0.42,
      proceduralMap: {
        skyColor: [0.05, 0.12, 0.18],
        horizonColor: [0.1, 0.22, 0.28],
        groundColor: [0.015, 0.018, 0.022],
        specularColor: [0.72, 0.95, 1],
        intensity: 0.34,
        specularIntensity: 0.92
      }
    },
    environmentFog: {
      mode: "exponential-squared",
      color: [0.015, 0.035, 0.04],
      near: 3,
      far: 12,
      density: reducedMotion ? 0.014 : 0.022,
      maxOpacity: reducedMotion ? 0.36 : 0.52
    },
    stageGeometry: {
      floor: {
        label: "side-view-game-floor",
        center: [0, -0.04, 0],
        size: [8.4, 0.08, 2.2],
        materialRole: "gameplay-floor",
        receiveShadow: true
      },
      rearRim: {
        label: "side-view-game-rear-rim",
        center: [0, 0.08, -1.14],
        size: [8.8, 0.1, 0.14],
        materialRole: "arena-rim"
      },
      laneBounds: {
        minX: -3.85,
        maxX: 3.85,
        minZ: -0.46,
        maxZ: 0.46
      }
    },
    particles: {
      enabled: true,
      layerId: "arena-ambient-particles",
      count: reducedMotion ? 48 : 128,
      reducedMotionCount: 48,
      colors: ["#8ff7ff", "#f5d36c", "#ff6bd5"],
      normalPassOnly: true
    },
    debugOverlays: {
      enabled: Boolean(options.debugVolumesEnabled),
      normalPassVisible: false,
      collisionVolumeKinds: ["hitbox", "hurtbox", "guardbox", "pushbox"],
      label: "collision-volumes"
    },
    shadow: {
      enabled: true,
      strength: 0.38
    },
    /*
     * Measured, not aspirational. Aura Clash holds 16.67 ms / 60 FPS / 91 draws with every feature in
     * `enabledFeatures` active, including the shadow pass and full-frame postprocess that were once
     * disabled here to keep the route responsive. That cost turned out to be per-operation
     * `gl.getError()` stalls (~93% of frame time), not the passes themselves, so the passes are enabled
     * and their real cost is measured rather than assumed.
     */
    performanceBudget: {
      maxFrameTimeMs: 16.7,
      // 55 rather than 60: headless capture jitter costs a frame or two, and failing the budget on
      // capture noise would train the gate to be ignored.
      minFps: 55,
      maxDrawCalls: 160,
      enabledFeatures: [
        "shadow-map",
        "bloom",
        "color-grade",
        "environment-fog",
        "environment-lighting",
        "ambient-particles",
        "skinned-glb-fighters",
        "consolidated-typed-arena"
      ]
    },
    postprocess: {
      targetFormat: "rgba8",
      bloom: {
        threshold: 0.78,
        intensity: reducedMotion ? 0.18 : 0.32,
        radius: 2
      },
      colorGrade: {
        contrast: 1.08,
        saturation: 1.04,
        vibrance: 0.12,
        vignette: 0.22,
        sharpening: 0.18
      }
    },
    debugVolumesEnabled: Boolean(options.debugVolumesEnabled)
  };
}
