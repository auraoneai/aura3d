import { createLayeredParticleBudgetPlan } from "@aura3d/rendering";

export type DataGalaxyBudgetMode = "interactive" | "showcase" | "stress";

export interface DataGalaxyBudgetOptions {
  readonly requestedParticles: number;
  readonly connections: boolean;
}

export interface DataGalaxyOverlayBudget {
  readonly detail: number;
  readonly sparkPoints: number;
  readonly coreSparkPoints: number;
  readonly focalClusterPoints: number;
  readonly trailSegments: number;
  readonly connectionSegments: number;
  readonly contourSegments: number;
  readonly telemetryRingCount: number;
  readonly telemetryRingSegments: number;
  readonly budgetLadderSegments: number;
}

export interface DataGalaxyBudgetPlan {
  readonly requestedParticles: number;
  readonly effectiveParticles: number;
  readonly mode: DataGalaxyBudgetMode;
  readonly densityTier: string;
  readonly primaryCount: number;
  readonly vortexCount: number;
  readonly networkCount: number;
  readonly waveCount: number;
  readonly nativeGpuComputeDispatches: 0;
  readonly overlay: DataGalaxyOverlayBudget;
}

export interface DataGalaxyLayerComposition {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface DataGalaxyCompositionProfile {
  readonly primary: DataGalaxyLayerComposition;
  readonly vortex: DataGalaxyLayerComposition;
  readonly network: DataGalaxyLayerComposition;
  readonly wave: DataGalaxyLayerComposition;
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly telemetryBars: boolean;
  readonly evidenceLabelBudget: number;
}

export const DATA_GALAXY_MIN_PARTICLES = 700;
export const DATA_GALAXY_SHOWCASE_PARTICLES = 900;
export const DATA_GALAXY_DEFAULT_PARTICLES = DATA_GALAXY_SHOWCASE_PARTICLES;
export const DATA_GALAXY_STRESS_PARTICLES = 24000;
export const DATA_GALAXY_MAX_PARTICLES = 50000;

const DATA_GALAXY_BUDGET_LADDER_SEGMENTS = 6;
export const DATA_GALAXY_TELEMETRY_RING_SEGMENTS = 20;
const DATA_GALAXY_LAYER_WEIGHTS = [
  { name: "primary", weight: 0.86 },
  { name: "vortex", weight: 0.06 },
  { name: "network", weight: 0.05 },
  { name: "wave", weight: 0.03 }
] as const;

const DATA_GALAXY_DENSITY_TIERS = [
  { threshold: DATA_GALAXY_MAX_PARTICLES, label: "50k stress", mode: "stress" },
  { threshold: DATA_GALAXY_STRESS_PARTICLES, label: "24k stress", mode: "stress" },
  { threshold: DATA_GALAXY_SHOWCASE_PARTICLES, label: "900 curated showcase", mode: "showcase" },
  { threshold: DATA_GALAXY_MIN_PARTICLES, label: "700 interactive", mode: "interactive" }
] as const satisfies readonly { readonly threshold: number; readonly label: string; readonly mode: DataGalaxyBudgetMode }[];

export function createDataGalaxyBudgetPlan(options: DataGalaxyBudgetOptions): DataGalaxyBudgetPlan {
  const layeredBudget = createLayeredParticleBudgetPlan<DataGalaxyBudgetMode>({
    requestedParticles: options.requestedParticles,
    defaultParticles: DATA_GALAXY_DEFAULT_PARTICLES,
    minParticles: DATA_GALAXY_MIN_PARTICLES,
    maxParticles: DATA_GALAXY_MAX_PARTICLES,
    layers: DATA_GALAXY_LAYER_WEIGHTS,
    densityTiers: DATA_GALAXY_DENSITY_TIERS,
    nativeGpuComputeDispatches: 0
  });
  const requestedParticles = layeredBudget.requestedParticles;
  const effectiveParticles = layeredBudget.effectiveParticles;
  const primaryCount = layerCount(layeredBudget.layers, "primary");
  const vortexCount = layerCount(layeredBudget.layers, "vortex");
  const networkCount = layerCount(layeredBudget.layers, "network");
  const waveCount = layerCount(layeredBudget.layers, "wave");
  const detail = overlayDetailForParticleCount(effectiveParticles);
  const telemetryRingCount = layeredBudget.mode === "stress"
    ? effectiveParticles >= DATA_GALAXY_MAX_PARTICLES ? 5 : 4
    : 0;

  return {
    requestedParticles,
    effectiveParticles,
    mode: layeredBudget.mode,
    densityTier: layeredBudget.densityTier,
    primaryCount,
    vortexCount,
    networkCount,
    waveCount,
    nativeGpuComputeDispatches: 0,
    overlay: {
      detail,
      sparkPoints: Math.round(260 * detail),
      coreSparkPoints: Math.round(96 * detail),
      focalClusterPoints: Math.round(180 * detail),
      trailSegments: Math.round(110 * detail),
      connectionSegments: options.connections ? Math.round(44 * detail) : 0,
      contourSegments: Math.round(56 * detail),
      telemetryRingCount,
      telemetryRingSegments: telemetryRingCount * DATA_GALAXY_TELEMETRY_RING_SEGMENTS,
      budgetLadderSegments: layeredBudget.mode === "stress" ? DATA_GALAXY_BUDGET_LADDER_SEGMENTS : 0
    }
  };
}

export function createDataGalaxyCompositionProfile(plan: DataGalaxyBudgetPlan): DataGalaxyCompositionProfile {
  const stressScale = plan.mode === "stress" ? 0.86 : 1;
  const focalScale = plan.mode === "showcase" ? 1.25 : plan.mode === "interactive" ? 0.78 : 0.9;
  const supportScale = plan.mode === "showcase" ? 0.06 : 0.68;
  return {
    primary: {
      position: [0, 0.04, 0.02],
      scale: [0.19 * focalScale * stressScale, 0.17 * focalScale * stressScale, 0.19 * focalScale * stressScale]
    },
    vortex: {
      position: plan.mode === "showcase" ? [0.13, 0.11, -0.12] : [0.42, 0.12, -0.36],
      scale: [0.18 * supportScale * stressScale, 0.18 * supportScale * stressScale, 0.18 * supportScale * stressScale]
    },
    network: {
      position: plan.mode === "showcase" ? [-0.15, -0.04, 0.14] : [-0.48, -0.08, 0.34],
      scale: [0.14 * supportScale * stressScale, 0.14 * supportScale * stressScale, 0.14 * supportScale * stressScale]
    },
    wave: {
      position: plan.mode === "showcase" ? [0.04, -0.13, 0.18] : [0.62, -0.24, 0.46],
      scale: [0.12 * supportScale * stressScale, 0.1 * supportScale * stressScale, 0.12 * supportScale * stressScale]
    },
    boundsMin: plan.mode === "showcase" ? [-0.52, -0.38, -0.46] : [-1.28, -0.9, -1.0],
    boundsMax: plan.mode === "showcase" ? [0.52, 0.5, 0.46] : [1.28, 0.96, 1.0],
    telemetryBars: plan.mode === "stress",
    evidenceLabelBudget: plan.mode === "stress" ? 14 : plan.mode === "showcase" ? 10 : 9
  };
}

function overlayDetailForParticleCount(total: number): number {
  if (total >= DATA_GALAXY_MAX_PARTICLES) return 0.32;
  if (total >= DATA_GALAXY_STRESS_PARTICLES) return 0.24;
  if (total >= DATA_GALAXY_SHOWCASE_PARTICLES) return 0.22;
  return 0.04;
}

function layerCount(layers: readonly { readonly name: string; readonly particleCount: number }[], name: string): number {
  return layers.find((layer) => layer.name === name)?.particleCount ?? 0;
}
