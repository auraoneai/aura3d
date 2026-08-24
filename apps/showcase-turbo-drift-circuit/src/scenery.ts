/**
 * Turbo Drift Circuit instanced scenery + late-afternoon grade (PRD TDC-A3 / C6/C7/C16).
 *
 * Crowd stands, tree lines and tyre walls draw through the public instancing surface
 * (`instances.*`) so many set-dressing transforms render as one draw call per primitive,
 * and far treeline bands use `distanceLod` so distant geometry drops detail instead of
 * disappearing.
 *
 * This module also *formalises* the late-afternoon mood the upgrade pass introduced:
 * warm key light, cool rim, cool fog distance - previously tuned literals scattered in
 * `main.ts`, now named constants consumed by the route so a future regrade is one edit.
 *
 * All placement is computed on the game plane from the certified centreline and stays
 * outside the same passing-lane corridor the props respect; nothing here touches
 * simulation, grip or timing.
 */

export type TurboSceneryKind = "crowd-stand" | "tree-cluster" | "tire-wall";

export interface TurboSceneryItem {
  readonly id: string;
  readonly kind: TurboSceneryKind;
  readonly progress: number;
  /** Signed lateral offset from the centreline, game units (positive = left of travel). */
  readonly signedOffsetGame: number;
  readonly point: { readonly x: number; readonly y: number };
  /** Game-plane yaw of the item (kit heading convention). */
  readonly headingGame: number;
  /** Footprint size in scene units (width, height, depth). */
  readonly sizeScene: readonly [number, number, number];
}

/** Formalised late-afternoon presentation constants. Values match the retained route look. */
export const TURBO_LATE_AFTERNOON_MOOD = {
  name: "circuit late afternoon",
  background: "#6a8fa8",
  environmentName: "circuit late afternoon reflections",
  environmentColor: "#ffe8cc",
  environmentIntensity: 1.12,
  ambientColor: "#fff0dc",
  ambientIntensity: 1.02,
  keyColor: "#ffd8a8",
  keyIntensity: 2.35,
  /** Key-light position as fractions of SCENE_SIZE (x, y, z). */
  keyPositionFractions: { x: -0.83, y: 1.2, z: 0.65 },
  rimColor: "#c8dff5",
  rimIntensity: 0.88,
  rimPositionFractions: { x: 0.65, y: 0.59, z: -0.56 },
  pitFillColor: "#ffcfa0",
  fogColor: "#7a9eb8",
  /** Fog density at the reference scene size; scaled by SCENE_SIZE at runtime. */
  fogReferenceDensity: 0.028,
  fogReferenceSceneSize: 5.4,
  fogIntensity: 0.36
} as const;

export interface PlanTurboSceneryInput {
  readonly sampleAt: (progress: number) => { readonly x: number; readonly y: number; readonly heading: number };
  /** Signed curvature probe, 1/radius in route units, positive = left corner. */
  readonly curvatureAt: (progress: number) => number;
  readonly visualAsphaltHalfWidthGame: number;
  /** Verge margin added to the corridor before any scenery may start. */
  readonly vergeMarginGame: number;
  /** Track bounding box on the game plane, used to ring trees outside the circuit. */
  readonly trackBoundsGame: {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
  };
  readonly counts?: {
    readonly crowdStands?: number;
    readonly treeClusters?: number;
    readonly tireWalls?: number;
  };
  readonly seed: number;
}

export interface TurboSceneryPlan {
  readonly crowdStands: readonly TurboSceneryItem[];
  readonly trees: readonly TurboSceneryItem[];
  readonly tireWalls: readonly TurboSceneryItem[];
  /** Minimum centreline distance across stands/walls, proving verge placement. */
  readonly minVergeDistanceGame: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function turboLeftVector(heading: number): { readonly x: number; readonly z: number } {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

function offsetPoint(
  sample: { readonly x: number; readonly y: number; readonly heading: number },
  offset: number
): { readonly x: number; readonly y: number } {
  const left = turboLeftVector(sample.heading);
  return { x: sample.x + left.x * offset, y: sample.y + left.z * offset };
}

/**
 * Plans crowd stands on corner exteriors, tyre walls along straighter verge segments and
 * tree clusters ringing the whole circuit.
 */
export function planTurboScenery(input: PlanTurboSceneryInput): TurboSceneryPlan {
  const rng = mulberry32(input.seed);
  const counts = {
    crowdStands: input.counts?.crowdStands ?? 6,
    treeClusters: input.counts?.treeClusters ?? 26,
    tireWalls: input.counts?.tireWalls ?? 10
  };
  const baseOffset = input.visualAsphaltHalfWidthGame + input.vergeMarginGame;

  // Corner exterior map: keep anchors with meaningful curvature and place each stand on
  // the outside of the corner (opposite the turn direction).
  const crowdStands: TurboSceneryItem[] = [];
  const standSpan = 1 / Math.max(1, counts.crowdStands);
  for (let index = 0; index < counts.crowdStands; index += 1) {
    const anchorProgress = index * standSpan + standSpan * 0.5;
    let bestProgress = anchorProgress;
    let bestCurvature = 0;
    for (let probe = -3; probe <= 3; probe += 1) {
      const candidate = (anchorProgress + (probe * standSpan) / 8 + 1) % 1;
      const curvature = Math.abs(input.curvatureAt(candidate));
      if (curvature > bestCurvature) {
        bestCurvature = curvature;
        bestProgress = candidate;
      }
    }
    const sample = input.sampleAt(bestProgress);
    const curvatureSign = Math.sign(input.curvatureAt(bestProgress)) || 1;
    const outsideSide = -curvatureSign;
    const depthGame = 0.05 + rng() * 0.02;
    const widthGame = 0.16 + rng() * 0.08;
    const signedOffset = outsideSide * (baseOffset + depthGame / 2 + 0.02);
    crowdStands.push({
      id: "turbo-scenery-crowd-" + index,
      kind: "crowd-stand",
      progress: bestProgress,
      signedOffsetGame: signedOffset,
      point: offsetPoint(sample, signedOffset),
      headingGame: sample.heading,
      sizeScene: [Number((widthGame * 12).toFixed(4)), 0.075, Number((depthGame * 12).toFixed(4))]
    });
  }

  // Tyre walls along straighter segments, alternating sides.
  const tireWalls: TurboSceneryItem[] = [];
  const wallSpan = 1 / Math.max(1, counts.tireWalls);
  for (let index = 0; index < counts.tireWalls; index += 1) {
    let bestProgress = index * wallSpan + wallSpan * 0.5;
    let bestStraightness = Number.POSITIVE_INFINITY;
    for (let probe = -3; probe <= 3; probe += 1) {
      const candidate = (index * wallSpan + wallSpan * 0.5 + (probe * wallSpan) / 8 + 1) % 1;
      const straightness = Math.abs(input.curvatureAt(candidate));
      if (straightness < bestStraightness) {
        bestStraightness = straightness;
        bestProgress = candidate;
      }
    }
    const side = index % 2 === 0 ? 1 : -1;
    const sample = input.sampleAt(bestProgress);
    const signedOffset = side * (baseOffset + 0.035);
    tireWalls.push({
      id: "turbo-scenery-wall-" + index,
      kind: "tire-wall",
      progress: bestProgress,
      signedOffsetGame: signedOffset,
      point: offsetPoint(sample, signedOffset),
      headingGame: sample.heading,
      sizeScene: [0.34, 0.028, 0.03]
    });
  }

  // Tree clusters: ring the bounding box well outside the circuit on all sides.
  const trees: TurboSceneryItem[] = [];
  const midX = (input.trackBoundsGame.minX + input.trackBoundsGame.maxX) / 2;
  const midZ = (input.trackBoundsGame.minZ + input.trackBoundsGame.maxZ) / 2;
  const spanX = Math.max(1e-3, input.trackBoundsGame.maxX - input.trackBoundsGame.minX);
  const spanZ = Math.max(1e-3, input.trackBoundsGame.maxZ - input.trackBoundsGame.minZ);
  const ringScaleX = 1.18 + rng() * 0.14;
  const ringScaleZ = 1.18 + rng() * 0.14;
  for (let index = 0; index < counts.treeClusters; index += 1) {
    const angle = (index / counts.treeClusters) * Math.PI * 2 + rng() * 0.22;
    const radiusX = (spanX / 2) * ringScaleX;
    const radiusZ = (spanZ / 2) * ringScaleZ;
    const radius = Math.max(radiusX, radiusZ) * (0.92 + rng() * 0.24);
    const x = midX + Math.cos(angle) * radius;
    const z = midZ + Math.sin(angle) * radius;
    const height = 0.5 + rng() * 0.42;
    trees.push({
      id: "turbo-scenery-tree-" + index,
      kind: "tree-cluster",
      progress: -1,
      signedOffsetGame: Number.POSITIVE_INFINITY,
      point: { x, y: z },
      headingGame: angle,
      sizeScene: [Number((height * 0.42).toFixed(4)), Number(height.toFixed(4)), Number((height * 0.42).toFixed(4))]
    });
  }

  const edges = [...crowdStands, ...tireWalls].map((item) => {
    const sample = input.sampleAt(item.progress);
    return Math.hypot(item.point.x - sample.x, item.point.y - sample.y);
  });
  return {
    crowdStands,
    trees,
    tireWalls,
    minVergeDistanceGame: edges.length ? Number(Math.min(...edges).toFixed(6)) : 0
  };
}