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
  readonly debugVolumesEnabled: boolean;
}

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
      farPadding: 1.8
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
    postprocess: {
      targetFormat: "rgba8",
      bloom: {
        threshold: 0.78,
        intensity: reducedMotion ? 0.18 : 0.32,
        radius: 0.44
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
