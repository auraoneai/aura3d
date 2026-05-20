import { createLayeredParticleBudgetPlan } from "@galileo3d/rendering";

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

export const DATA_GALAXY_MIN_PARTICLES = 4000;
export const DATA_GALAXY_SHOWCASE_PARTICLES = 12000;
export const DATA_GALAXY_DEFAULT_PARTICLES = DATA_GALAXY_SHOWCASE_PARTICLES;
export const DATA_GALAXY_STRESS_PARTICLES = 24000;
export const DATA_GALAXY_MAX_PARTICLES = 50000;

const DATA_GALAXY_BUDGET_LADDER_SEGMENTS = 12;
const DATA_GALAXY_LAYER_WEIGHTS = [
  { name: "primary", weight: 0.54 },
  { name: "vortex", weight: 0.23 },
  { name: "network", weight: 0.15 },
  { name: "wave", weight: 0 }
] as const;

const DATA_GALAXY_DENSITY_TIERS = [
  { threshold: DATA_GALAXY_MAX_PARTICLES, label: "50k stress", mode: "stress" },
  { threshold: DATA_GALAXY_STRESS_PARTICLES, label: "24k stress", mode: "stress" },
  { threshold: DATA_GALAXY_SHOWCASE_PARTICLES, label: "12k showcase", mode: "showcase" },
  { threshold: DATA_GALAXY_MIN_PARTICLES, label: "4k interactive", mode: "interactive" }
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
  const telemetryRingCount = effectiveParticles >= DATA_GALAXY_STRESS_PARTICLES
    ? effectiveParticles >= DATA_GALAXY_MAX_PARTICLES ? 5 : 4
    : effectiveParticles >= DATA_GALAXY_SHOWCASE_PARTICLES ? 2 : 1;

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
      sparkPoints: Math.round(520 * detail),
      coreSparkPoints: Math.round(180 * detail),
      focalClusterPoints: Math.round(220 * detail),
      trailSegments: Math.round(240 * detail),
      connectionSegments: options.connections ? Math.round(110 * detail) : 0,
      contourSegments: Math.round(150 * detail),
      telemetryRingCount,
      telemetryRingSegments: telemetryRingCount * 28,
      budgetLadderSegments: DATA_GALAXY_BUDGET_LADDER_SEGMENTS
    }
  };
}

export function createDataGalaxyCompositionProfile(plan: DataGalaxyBudgetPlan): DataGalaxyCompositionProfile {
  const stressScale = plan.mode === "stress" ? 0.88 : 1;
  const focalScale = plan.mode === "showcase" ? 1.62 : plan.mode === "interactive" ? 1.08 : 1;
  const supportScale = plan.mode === "showcase" ? 1.2 : 1;
  return {
    primary: {
      position: [0, 0.04, -0.04],
      scale: [0.3 * focalScale * stressScale, 0.3 * focalScale * stressScale, 0.3 * focalScale * stressScale]
    },
    vortex: {
      position: [0.24, 0.14, -0.22],
      scale: [0.2 * supportScale * stressScale, 0.2 * supportScale * stressScale, 0.2 * supportScale * stressScale]
    },
    network: {
      position: [-0.6, -0.06, 0.36],
      scale: [0.13 * supportScale * stressScale, 0.13 * supportScale * stressScale, 0.13 * supportScale * stressScale]
    },
    wave: {
      position: [0.56, -0.22, 0.42],
      scale: [0.12 * supportScale * stressScale, 0.1 * supportScale * stressScale, 0.12 * supportScale * stressScale]
    },
    boundsMin: plan.mode === "showcase" ? [-1.18, -0.78, -0.96] : [-1.42, -0.94, -1.1],
    boundsMax: plan.mode === "showcase" ? [1.2, 0.88, 0.94] : [1.42, 1.02, 1.08],
    telemetryBars: plan.mode !== "interactive",
    evidenceLabelBudget: plan.mode === "stress" ? 14 : plan.mode === "showcase" ? 12 : 10
  };
}

function overlayDetailForParticleCount(total: number): number {
  if (total >= DATA_GALAXY_MAX_PARTICLES) return 0.32;
  if (total >= DATA_GALAXY_STRESS_PARTICLES) return 0.24;
  if (total >= DATA_GALAXY_SHOWCASE_PARTICLES) return 0.36;
  return 0.04;
}

function layerCount(layers: readonly { readonly name: string; readonly particleCount: number }[], name: string): number {
  return layers.find((layer) => layer.name === name)?.particleCount ?? 0;
}
