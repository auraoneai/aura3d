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

/**
 * J1 performance-governor policy.
 *
 * `off` never touches quality settings; `conservative` degrades one step per
 * over-budget frame and recovers only after sustained headroom; `aggressive`
 * degrades up to two steps per over-budget frame and recovers faster. Degrade
 * order is fixed: resolution scale, particle scale, LOD bias, shadow size.
 */
export type GamePerformanceGovernorMode = "off" | "conservative" | "aggressive";

/** Per-frame telemetry published in diagnostics (J1 task 2). */
export interface GamePerFramePerfTelemetry {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly draws: number;
  readonly tris: number;
  readonly particles: number;
  readonly shadowBytes: number;
}

/** Quality knobs the governor is allowed to move. */
export interface GamePerformanceGovernorSettings {
  readonly resolutionScale: number;
  readonly lodBias: number;
  readonly particleScale: number;
  readonly shadowSize: number;
}

/**
 * Per-pass cost model (J1 task 1). The A2 pass-cost work plugs in here when it
 * lands; until then these defaults are headed estimates used only to order
 * degrade steps, never as proof of frame cost.
 */
export interface GamePerPassCostModel {
  readonly shadowMapMs: number;
  readonly bloomMs: number;
  readonly colorGradeMs: number;
  readonly ambientParticlesMs: number;
  readonly environmentFogMs: number;
}

export const DEFAULT_GAME_PER_PASS_COST_MODEL: GamePerPassCostModel = {
  shadowMapMs: 2.1,
  bloomMs: 1.4,
  colorGradeMs: 0.6,
  ambientParticlesMs: 0.9,
  environmentFogMs: 0.3
};

export function estimateGamePerPassCostTotal(model: GamePerPassCostModel = DEFAULT_GAME_PER_PASS_COST_MODEL): number {
  return model.shadowMapMs + model.bloomMs + model.colorGradeMs + model.ambientParticlesMs + model.environmentFogMs;
}

export const DEFAULT_GAME_GOVERNOR_SETTINGS: GamePerformanceGovernorSettings = {
  resolutionScale: 1,
  lodBias: 1,
  particleScale: 1,
  shadowSize: 1024
};

const RESOLUTION_STEPS = [1, 0.85, 0.7, 0.5] as const;
const PARTICLE_STEPS = [1, 0.7, 0.4, 0.2] as const;
const LOD_STEPS = [1, 1.25, 1.6, 2] as const;
const SHADOW_STEPS = [1024, 512, 256, 256] as const;

export interface GamePerformanceGovernor {
  readonly mode: GamePerformanceGovernorMode;
  readonly settings: GamePerformanceGovernorSettings;
  readonly degraded: readonly string[];
  step(telemetry: GamePerFramePerfTelemetry, budget: SideViewGamePerformanceBudget): GamePerformanceGovernor;
}

interface GovernorState extends GamePerformanceGovernorSettings {
  headroomFrames: number;
}

function stepIndex<T>(steps: readonly T[], current: T, direction: -1 | 1): T {
  const index = steps.indexOf(current);
  const fallback = direction === 1 ? steps.length - 1 : 0;
  const resolved = index < 0 ? fallback : Math.min(steps.length - 1, Math.max(0, index + direction));
  return steps[resolved] ?? current;
}

/**
 * Pure auto-governor step. Resolution scale degrades before particle scale,
 * before LOD bias, before shadow size; recovery walks the same ladder back up
 * after sustained headroom (4 frames conservative, 2 aggressive).
 */
export function createPerformanceGovernor(
  mode: GamePerformanceGovernorMode = "conservative",
  initial: GamePerformanceGovernorSettings = DEFAULT_GAME_GOVERNOR_SETTINGS
): GamePerformanceGovernor {
  const degraded: string[] = [];
  const make = (next: GovernorState, changed: readonly string[]): GamePerformanceGovernor => ({
    mode,
    settings: {
      resolutionScale: next.resolutionScale,
      lodBias: next.lodBias,
      particleScale: next.particleScale,
      shadowSize: next.shadowSize
    },
    degraded: [...degraded, ...changed],
    step(telemetry, budget) {
      if (mode === "off") return make({ ...next, headroomFrames: 0 }, []);
      const overBudget = telemetry.frameTimeMs > budget.maxFrameTimeMs || telemetry.fps < budget.minFps;
      if (overBudget) {
        const steps = mode === "aggressive" ? 2 : 1;
        let working = { ...next, headroomFrames: 0 };
        const applied: string[] = [];
        for (let i = 0; i < steps; i += 1) {
          const before = working;
          if (working.resolutionScale !== RESOLUTION_STEPS[RESOLUTION_STEPS.length - 1]) {
            working = { ...working, resolutionScale: stepIndex(RESOLUTION_STEPS, working.resolutionScale, 1) };
            applied.push("resolutionScale");
          } else if (working.particleScale !== PARTICLE_STEPS[PARTICLE_STEPS.length - 1]) {
            working = { ...working, particleScale: stepIndex(PARTICLE_STEPS, working.particleScale, 1) };
            applied.push("particleScale");
          } else if (working.lodBias !== LOD_STEPS[LOD_STEPS.length - 1]) {
            working = { ...working, lodBias: stepIndex(LOD_STEPS, working.lodBias, 1) };
            applied.push("lodBias");
          } else if (working.shadowSize !== SHADOW_STEPS[SHADOW_STEPS.length - 1]) {
            working = { ...working, shadowSize: stepIndex(SHADOW_STEPS, working.shadowSize, 1) };
            applied.push("shadowSize");
          }
          if (working === before) break;
        }
        degraded.push(...applied);
        return make(working, []);
      }
      const headroom = telemetry.frameTimeMs <= budget.maxFrameTimeMs * 0.8 && telemetry.fps >= budget.minFps;
      const sustained = next.headroomFrames + 1;
      const threshold = mode === "aggressive" ? 2 : 4;
      if (!headroom) return make({ ...next, headroomFrames: 0 }, []);
      if (sustained < threshold) return make({ ...next, headroomFrames: sustained }, []);
      // Recover one rung, in reverse degrade order: shadow size, LOD bias, particles, resolution.
      let working = { ...next, headroomFrames: 0 };
      const recovered: string[] = [];
      if (working.shadowSize !== SHADOW_STEPS[0]) {
        working = { ...working, shadowSize: stepIndex(SHADOW_STEPS, working.shadowSize, -1) };
        recovered.push("shadowSize");
      } else if (working.lodBias !== LOD_STEPS[0]) {
        working = { ...working, lodBias: stepIndex(LOD_STEPS, working.lodBias, -1) };
        recovered.push("lodBias");
      } else if (working.particleScale !== PARTICLE_STEPS[0]) {
        working = { ...working, particleScale: stepIndex(PARTICLE_STEPS, working.particleScale, -1) };
        recovered.push("particleScale");
      } else if (working.resolutionScale !== RESOLUTION_STEPS[0]) {
        working = { ...working, resolutionScale: stepIndex(RESOLUTION_STEPS, working.resolutionScale, -1) };
        recovered.push("resolutionScale");
      }
      return make(working, recovered.map((name) => `recovered:${name}`));
    }
  });
  return make({ ...initial, headroomFrames: 0 }, []);
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

export interface TopDownGameRenderPresetOptions {
  readonly debugVolumesEnabled?: boolean;
  readonly reducedMotion?: boolean;
}

export interface TopDownGameRenderPreset {
  readonly kind: "aura-top-down-game-render-preset";
  readonly cameraPolicy: RenderSource["cameraPolicy"];
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly particles: SideViewGameParticlePreset;
  readonly shadow: RendererShadowOptions;
  readonly postprocess: RendererPostProcessOptions;
  readonly performanceBudget: SideViewGamePerformanceBudget;
  readonly debugVolumesEnabled: boolean;
}

/**
 * Top-down twin of the side-view preset. It reuses the same measured budget
 * shape so every game preset declares the passes it was measured with (J1
 * task 3); the enabled set differs only by the arena features the top-down
 * stage does not mount (no skinned fighters, no consolidated arena).
 */
export function createTopDownGameRenderPreset(
  options: TopDownGameRenderPresetOptions = {}
): TopDownGameRenderPreset {
  const reducedMotion = Boolean(options.reducedMotion);
  return {
    kind: "aura-top-down-game-render-preset",
    cameraPolicy: "auto-frame",
    environmentLighting: {
      color: [0.58, 0.7, 0.82],
      intensity: 0.42
    },
    particles: {
      enabled: true,
      layerId: "arena-ambient-particles",
      count: reducedMotion ? 48 : 128,
      reducedMotionCount: 48,
      colors: ["#8ff7ff", "#f5d36c", "#ff6bd5"],
      normalPassOnly: true
    },
    shadow: {
      enabled: true,
      strength: 0.38
    },
    performanceBudget: {
      maxFrameTimeMs: 16.7,
      minFps: 55,
      maxDrawCalls: 160,
      enabledFeatures: [
        "shadow-map",
        "bloom",
        "color-grade",
        "environment-fog",
        "environment-lighting",
        "ambient-particles"
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

export type GameRenderPreset = SideViewGameRenderPreset | TopDownGameRenderPreset;

/** Measured-pass declarations for every game preset (J1 checklist item 3). */
export function gamePresetMeasuredPasses(
  preset: GameRenderPreset
): readonly SideViewGameBudgetedFeature[] {
  return preset.performanceBudget.enabledFeatures;
}
