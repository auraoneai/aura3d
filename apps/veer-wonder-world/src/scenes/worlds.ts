// Wonder World worlds (PRD 04 D08-D13, PRD 5.5.1 Section 4): the six sculpted
// tactile miniature dioramas on the toy island. Each world combines a
// procedural felt/wood/cloud plinth (`y = 0.000` across the entire play area),
// spline paths/rails/rainbows, single-draw instanced flora/props, and merged
// procedural craft scenery (`mountStaticDressingAsset`, zero external `.glb`s).

import {
  instances,
  material,
  primitives,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { createFbm2D } from "@aura3d/engine/procedural";
import type { ModelKey } from "../aura-assets.js";
import type { MusicBedId, WorldId } from "../types.js";
import type { Vec3 } from "./motion.js";
import { mountStaticDressingAsset } from "./procedural-rigs/index.js";
import {
  defaultHeightM,
  primitiveParams,
  type StandInShape
} from "./stand-ins.js";
import {
  clayMat,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  lacquerMat,
  smoothstep,
  warmPracticalGlowMat
} from "./diorama-terrain.js";
import { homeNook } from "./home-nook.js";
import { learningCloud } from "./learning-cloud.js";
import { meadow } from "./meadow.js";
import { moonlitNursery } from "./moonlit-nursery.js";
import { musicGarden } from "./music-garden.js";
import { peekabooBarn } from "./peekaboo-barn.js";
import { starlightCloud } from "./starlight-cloud.js";
import { station, TRACK_Z } from "./station.js";

/** A sculpted procedural rig placed as static scenery in a diorama world. */
export interface DressingModel {
  readonly kind: "model";
  readonly key: ModelKey;
  /** Base point (where it stands). */
  readonly at: Vec3;
  /** Fitted height in metres (default MODEL_INFO). */
  readonly heightM?: number;
  readonly yaw?: number;
  readonly tint?: string;
  readonly castShadow?: boolean;
}

/** A single primitive (ground details, hills, walls, rugs). `at` is its centre. */
export interface DressingPrimitive {
  readonly kind: "primitive";
  readonly shape: StandInShape;
  readonly color: string;
  readonly size: Vec3;
  readonly at: Vec3;
  readonly rotation?: Vec3;
  readonly roughness?: number;
  readonly emissive?: { readonly color: string; readonly intensity: number };
  readonly castShadow?: boolean;
  readonly segments?: number;
  readonly materialStyle?: "clay" | "felt" | "lacquer";
  /**
   * When true, the declarative entry remains inspectable in `WORLDS[id].dressing`
   * while custom procedural spline/diorama geometry renders in its place.
   */
  readonly replacedByDiorama?: boolean;
}

/** Many copies of one unit primitive in one draw call (piano keys, fence posts, sleepers). */
export interface DressingInstances {
  readonly kind: "instances";
  readonly shape: "box" | "sphere" | "cylinder";
  readonly name: string;
  readonly items: readonly {
    readonly at: Vec3;
    readonly size: Vec3;
    readonly rotation?: Vec3;
    readonly color: string;
  }[];
  readonly roughness?: number;
  readonly castShadow?: boolean;
  readonly windSway?: {
    readonly strength: number;
    readonly assetHeight: number;
  };
}

export type DressingItem = DressingModel | DressingPrimitive | DressingInstances;

export interface WorldAnimatedPose {
  readonly id: string;
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}

export interface WorldAnimatedNodeSpec {
  readonly id: string;
  readonly restPosition: Vec3;
  readonly restRotation?: Vec3;
  readonly restScale?: Vec3;
  readonly sample: (timeSec: number) => {
    readonly position?: Vec3;
    readonly rotation?: Vec3;
    readonly scale?: Vec3;
  };
}

export interface WorldDioramaContext {
  readonly reducedMotion: boolean;
  readonly available: (key: ModelKey) => boolean;
}

export interface WorldDioramaSlice {
  readonly nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[];
  readonly animated?: readonly WorldAnimatedNodeSpec[];
  readonly replaceDefaultGround?: boolean;
}

export interface WorldDefinition {
  readonly id: WorldId;
  /** Working title for diagnostics and docs (child-facing names live in the locale packs). */
  readonly workingTitle: string;
  readonly ground: { readonly color: string; readonly size: number };
  readonly dressing: readonly DressingItem[];
  readonly musicBed: MusicBedId;
  readonly buildDiorama?: (ctx: WorldDioramaContext) => WorldDioramaSlice;
}

export const WORLDS: Readonly<Record<WorldId, WorldDefinition>> = {
  meadow,
  "music-garden": musicGarden,
  "peekaboo-barn": peekabooBarn,
  station,
  "learning-cloud": learningCloud,
  "home-nook": homeNook,
  "moonlit-nursery": moonlitNursery,
  "starlight-cloud": starlightCloud
};

export const WORLD_IDS: readonly WorldId[] = [
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook",
  "moonlit-nursery",
  "starlight-cloud"
];

export function worldDefinition(id: WorldId): WorldDefinition {
  return WORLDS[id];
}

/** The procedural rig keys a world's dressing places. Stable order, no duplicates. */
export function worldDressingKeys(id: WorldId): readonly ModelKey[] {
  const keys: ModelKey[] = [];
  for (const item of WORLDS[id].dressing) {
    if (item.kind === "model" && !keys.includes(item.key)) keys.push(item.key);
  }
  return keys;
}

export interface BuildWorldOptions {
  readonly reducedMotion?: boolean;
  readonly mobile?: boolean;
}

export interface WorldRuntimeHandleLike {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: readonly [number, number, number]): unknown;
}

export interface BuiltWorld {
  readonly id: WorldId;
  readonly nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[];
  /** Dressing items mounted from merged procedural craft rigs. */
  readonly proceduralProps: number;
  /** Unique procedural rig keys mounted in this world build. */
  readonly proceduralKeys: readonly ModelKey[];
  /** Runtime node ids exposed for gentle ambient diorama motion. */
  readonly animatedIds: readonly string[];
  readonly sampleWorldMotion: (timeSec: number, reducedMotion: boolean) => readonly WorldAnimatedPose[];
  readonly updateWorld: (
    resolveHandle: (id: string) => WorldRuntimeHandleLike | undefined,
    timeSec: number,
    reducedMotion: boolean
  ) => void;
}

export type WorldBuild = BuiltWorld;

function primitiveMaterial(item: DressingPrimitive): AuraMaterialSpec {
  if (item.emissive) {
    return warmPracticalGlowMat(item.color, item.emissive.color, item.emissive.intensity);
  }
  if (item.materialStyle === "felt") {
    return feltMat(item.color);
  }
  if (item.materialStyle === "lacquer") {
    return lacquerMat(item.color);
  }
  if ((item.roughness ?? 0.9) >= 0.8) {
    return clayMat(item.color, false);
  }
  return material.standard({
    color: item.color,
    roughness: item.roughness ?? 0.65,
    metallic: 0,
    diffuseRoughness: 0.72,
    envMapIntensity: 0.82
  });
}

function primitiveNode(item: DressingPrimitive, name: string): AuraNodeBuilder<AuraSceneNode> {
  const params = primitiveParams(item.shape, item.segments);
  const options = {
    name,
    size: item.size,
    position: item.at,
    rotation: item.rotation ?? ([0, 0, 0] as const),
    material: primitiveMaterial(item),
    castShadow: item.castShadow ?? false,
    receiveShadow: true,
    ...(params ? { params } : {})
  };
  switch (item.shape) {
    case "sphere":
      return primitives.sphere(options);
    case "capsule":
      return primitives.capsule(options);
    case "box":
      return primitives.box(options);
    case "cylinder":
      return primitives.cylinder(options);
    case "torus":
      return primitives.torus(options);
    case "cone":
      return primitives.cone(options);
  }
}

function instancesNode(
  item: DressingInstances,
  name: string,
  reducedMotion: boolean
): AuraNodeBuilder<AuraSceneNode> {
  const wind = item.windSway
    ? gentleBreezeWind(reducedMotion, item.windSway.strength, item.windSway.assetHeight)
    : undefined;
  const options = {
    name,
    transforms: item.items.map((entry) => ({
      position: entry.at,
      scale: entry.size,
      ...(entry.rotation ? { rotation: entry.rotation } : {})
    })),
    colors: item.items.map((entry) => entry.color),
    material: instanceClayMat("#FFFFFF"),
    ...(wind ? { wind } : {}),
    castShadow: item.castShadow ?? false,
    receiveShadow: true
  };
  switch (item.shape) {
    case "box":
      return instances.box(options);
    case "sphere":
      return instances.sphere(options);
    case "cylinder":
      return instances.cylinder(options);
  }
}

/**
 * Builds a world's diorama ground, procedural craft details, and merged static dressing.
 */
export function buildWorldNodes(id: WorldId, options?: BuildWorldOptions): BuiltWorld;
export function buildWorldNodes(
  id: WorldId,
  available: (key: ModelKey) => boolean,
  options?: BuildWorldOptions
): BuiltWorld;
export function buildWorldNodes(
  id: WorldId,
  availableOrOptions?: ((key: ModelKey) => boolean) | BuildWorldOptions,
  maybeOptions?: BuildWorldOptions
): BuiltWorld {
  const options: BuildWorldOptions =
    typeof availableOrOptions === "function" ? (maybeOptions ?? {}) : (availableOrOptions ?? {});
  const world = WORLDS[id];
  const reducedMotion = options.reducedMotion ?? false;
  const diorama = world.buildDiorama
    ? world.buildDiorama({ reducedMotion, available: () => true })
    : { nodes: [], animated: [], replaceDefaultGround: false };

  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  let proceduralProps = 0;
  const proceduralKeys: ModelKey[] = [];

  if (!diorama.replaceDefaultGround) {
    nodes.push(
      primitives.plane({
        name: `${id}:ground`,
        size: [world.ground.size, 1, world.ground.size],
        material: feltMat(world.ground.color, false),
        castShadow: false,
        receiveShadow: true
      })
    );
  }

  nodes.push(...diorama.nodes);

  world.dressing.forEach((item, index) => {
    const name = `${id}:dressing-${index}`;
    if (item.kind === "primitive") {
      if (item.replacedByDiorama) return;
      nodes.push(primitiveNode(item, name));
      return;
    }
    if (item.kind === "instances") {
      nodes.push(instancesNode(item, `${id}:${item.name}`, reducedMotion));
      return;
    }
    const heightM = item.heightM ?? defaultHeightM(item.key);
    const radialDist = Math.hypot(item.at[0], item.at[2]);
    const mobileSkipShadow =
      options.mobile === true && (radialDist > 5.2 || item.at[1] > 1.8 || heightM < 0.35);
    nodes.push(
      ...mountStaticDressingAsset(
        item.key,
        heightM,
        name,
        item.at,
        item.yaw ?? 0,
        item.tint,
        mobileSkipShadow ? false : (item.castShadow ?? true)
      )
    );
    proceduralProps += 1;
    if (!proceduralKeys.includes(item.key)) proceduralKeys.push(item.key);
  });

  const animatedSpecs = diorama.animated ?? [];
  const animatedIds = animatedSpecs.map((spec) => spec.id);

  const sampleWorldMotion = (timeSec: number, isReducedMotion: boolean): readonly WorldAnimatedPose[] => {
    if (animatedSpecs.length === 0) return [];
    if (isReducedMotion) {
      return animatedSpecs.map((spec) => ({
        id: spec.id,
        position: spec.restPosition,
        ...(spec.restRotation ? { rotation: spec.restRotation } : {}),
        ...(spec.restScale ? { scale: spec.restScale } : {})
      }));
    }
    const t = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
    return animatedSpecs.map((spec) => {
      const sampled = spec.sample(t);
      return {
        id: spec.id,
        position: sampled.position ?? spec.restPosition,
        ...(sampled.rotation
          ? { rotation: sampled.rotation }
          : spec.restRotation
            ? { rotation: spec.restRotation }
            : {}),
        ...(sampled.scale
          ? { scale: sampled.scale }
          : spec.restScale
            ? { scale: spec.restScale }
            : {})
      };
    });
  };

  const updateWorld = (
    resolveHandle: (nodeId: string) => WorldRuntimeHandleLike | undefined,
    timeSec: number,
    isReducedMotion: boolean
  ): void => {
    for (const pose of sampleWorldMotion(timeSec, isReducedMotion)) {
      const handle = resolveHandle(pose.id);
      if (!handle) continue;
      if (pose.position) {
        handle.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      }
      if (pose.rotation) {
        handle.setRotation(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
      }
      if (pose.scale) {
        handle.setScale(pose.scale);
      }
    }
  };

  return {
    id,
    nodes,
    proceduralProps,
    proceduralKeys,
    animatedIds,
    sampleWorldMotion,
    updateWorld
  };
}

export const buildWorld = buildWorldNodes;

// ---------------------------------------------------------------- ground elevation & static obstacles

export interface WorldObstacleBox {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly halfW: number;
  readonly halfD: number;
  readonly height: number;
}

/** Exact swept steel I-rail head top on `"station"` (`0.002 + 0.044 + 0.054 = 0.100m`). */
const STATION_RAIL_HEAD_TOP_Y = 0.1;
/** Exact oak sleeper + tie-plate top on `"station"` (`0.002 + 0.024 + 0.040 + 0.007 = 0.073m`). */
const STATION_SLEEPER_TOP_Y = 0.073;
/** Central guaranteed-flat stage arena radius across all worlds. */
const CENTRAL_FLAT_ARENA_RADIUS = 3.65;

interface IslandPlinthElevationConfig {
  readonly fbm: (x: number, y: number) => number;
  readonly flatStageRadius: number;
  readonly islandRadius: number;
  readonly islandRadiusX: number;
  readonly outerSwellAmplitude: number;
  readonly quiltAmplitude: number;
  readonly basin?: {
    readonly center: readonly [number, number];
    readonly radius: number;
    readonly depth: number;
  };
  readonly channel?: {
    readonly points: readonly (readonly [number, number])[];
    readonly halfWidth: number;
    readonly depth: number;
  };
}

const MEADOW_BROOK_POINTS: readonly (readonly [number, number])[] = [
  [-7.8, -4.65],
  [-4.9, -4.2],
  [-1.95, -4.02],
  [1.35, -4.18],
  [4.55, -3.62],
  [6.95, -1.95]
];

function makePlinthFbm(seed: number): (x: number, y: number) => number {
  return createFbm2D(seed, { octaves: 3, gain: 0.48, lacunarity: 2.05 });
}

const ISLAND_ELEVATION_CONFIGS: Readonly<Partial<Record<WorldId, IslandPlinthElevationConfig>>> = {
  meadow: {
    fbm: makePlinthFbm(101),
    flatStageRadius: 3.75,
    islandRadius: 14.2,
    islandRadiusX: 21.6,
    outerSwellAmplitude: 0.38,
    quiltAmplitude: 0,
    channel: {
      points: MEADOW_BROOK_POINTS,
      halfWidth: 0.56,
      depth: 0.22
    }
  },
  "music-garden": {
    fbm: makePlinthFbm(302),
    flatStageRadius: 3.75,
    islandRadius: 13.8,
    islandRadiusX: 21.6,
    outerSwellAmplitude: 0.32,
    quiltAmplitude: 0,
    basin: {
      center: [-4.95, -1.62],
      radius: 1.02,
      depth: 0.22
    }
  },
  "peekaboo-barn": {
    fbm: makePlinthFbm(505),
    flatStageRadius: 3.5,
    islandRadius: 14.2,
    islandRadiusX: 21.6,
    outerSwellAmplitude: 0.36,
    quiltAmplitude: 0,
    basin: {
      center: [-3.4, -3.2],
      radius: 1.18,
      depth: 0.24
    }
  },
  station: {
    fbm: makePlinthFbm(404),
    flatStageRadius: 3.75,
    islandRadius: 14.6,
    islandRadiusX: 21.6,
    outerSwellAmplitude: 0.36,
    quiltAmplitude: 0
  },
  "learning-cloud": {
    fbm: makePlinthFbm(606),
    flatStageRadius: 3.75,
    islandRadius: 12.2,
    islandRadiusX: 19.6,
    outerSwellAmplitude: 0.42,
    quiltAmplitude: 0.22
  },
  "starlight-cloud": {
    fbm: makePlinthFbm(808),
    flatStageRadius: 3.6,
    islandRadius: 12.4,
    islandRadiusX: 19.6,
    outerSwellAmplitude: 0.38,
    quiltAmplitude: 0.24
  }
};

function distToChannelPolyline2D(
  px: number,
  pz: number,
  pts: readonly (readonly [number, number])[]
): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(px - pts[0]![0], pz - pts[0]![1]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i]![0];
    const az = pts[i]![1];
    const bx = pts[i + 1]![0];
    const bz = pts[i + 1]![1];
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq)) : 0;
    const d = Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
    if (d < best) best = d;
  }
  return best;
}

function sampleWorldOuterTerrain(worldId: WorldId, x: number, z: number): number {
  const stageR = Math.hypot(x, z);
  if (stageR <= CENTRAL_FLAT_ARENA_RADIUS) {
    return 0;
  }
  const cfg = ISLAND_ELEVATION_CONFIGS[worldId];
  if (!cfg) {
    // Indoor rooms (`home-nook`, `moonlit-nursery`) extend flat `y = 0` wood plank floors across the set.
    return 0;
  }

  const r = Math.hypot(x, z * 1.06);
  if (r <= cfg.flatStageRadius) {
    return 0;
  }

  const outerBlend = smoothstep(cfg.flatStageRadius, cfg.flatStageRadius + 2.6, r);
  const backBias = z < -2.4 ? smoothstep(-2.4, -9.5, z) * 0.42 : 0;
  const organic =
    (cfg.fbm(x * 0.13, z * 0.13) * 0.5 + 0.5) * cfg.outerSwellAmplitude +
    backBias * cfg.outerSwellAmplitude * 1.35;
  const quilt =
    cfg.quiltAmplitude > 0
      ? Math.abs(Math.sin(x * 0.95) * Math.cos(z * 0.95)) * cfg.quiltAmplitude * outerBlend
      : 0;

  const rimXScale = cfg.islandRadius / cfg.islandRadiusX;
  const rimR = Math.hypot(x * rimXScale, z * 1.06);
  const rimDrop = smoothstep(cfg.islandRadius - 2.1, cfg.islandRadius, rimR) * 0.72;
  let h = (organic + quilt) * outerBlend - rimDrop;

  if (cfg.basin) {
    const dBasin = Math.hypot(x - cfg.basin.center[0], z - cfg.basin.center[1]);
    if (dBasin < cfg.basin.radius + 0.95) {
      const dip = 1 - smoothstep(cfg.basin.radius * 0.45, cfg.basin.radius + 0.85, dBasin);
      h -= dip * cfg.basin.depth;
    }
  }

  if (cfg.channel) {
    const dChan = distToChannelPolyline2D(x, z, cfg.channel.points);
    if (dChan < cfg.channel.halfWidth + 0.85) {
      const dip = 1 - smoothstep(cfg.channel.halfWidth * 0.42, cfg.channel.halfWidth + 0.75, dChan);
      const stageGuard = smoothstep(cfg.flatStageRadius, cfg.flatStageRadius + 0.55, r);
      h = h * (1 - dip * 0.85 * stageGuard) - dip * cfg.channel.depth * stageGuard;
    }
  }

  const arenaBlend = smoothstep(CENTRAL_FLAT_ARENA_RADIUS, CENTRAL_FLAT_ARENA_RADIUS + 0.2, stageR);
  return Math.max(0, h * arenaBlend);
}

/**
 * Pure deterministic ground-surface elevation query for actor & prop placement:
 * - `"station"` rolling stock (`"gogo"`, `"gogoCarriage"`) on the `z = -1.6` track rides on the `0.10m` steel rail heads;
 *   grounded characters/props on the sleeper bed (`|z + 1.6| <= 0.30 && x > -5.1`) rest at `0.073m` with a smooth ramp across `0.30..0.48`.
 * - Central stage arena (`Math.hypot(x, z) <= 3.65`) returns `0` on non-track spots so every on-stage `SPOTS` coordinate stays exact.
 * - Outer approaches (`r > 3.65`) follow each world's sculpted island plinth swell (`0` on indoor plank floors).
 */
export function worldGroundElevation(
  worldId: WorldId | null | undefined,
  x: number,
  z: number,
  asset?: string
): number {
  if (!worldId || !Number.isFinite(x) || !Number.isFinite(z)) {
    return 0;
  }

  if (worldId === "station") {
    const dz = Math.abs(z - TRACK_Z);
    const baseY = sampleWorldOuterTerrain(worldId, x, z);
    if (asset === "gogo" || asset === "gogoCarriage") {
      if (dz <= 0.48) {
        return STATION_RAIL_HEAD_TOP_Y;
      }
      if (dz < 0.62) {
        const railWeight = 1 - smoothstep(0.48, 0.62, dz);
        return baseY + (STATION_RAIL_HEAD_TOP_Y - baseY) * railWeight;
      }
      return baseY;
    }
    if (dz <= 0.48 && x > -5.25 && x <= 5.95) {
      const zWeight = dz <= 0.3 ? 1 : 1 - smoothstep(0.3, 0.48, dz);
      const xWeight =
        x > -5.1
          ? x <= 5.8
            ? 1
            : 1 - smoothstep(5.8, 5.95, x)
          : smoothstep(-5.25, -5.1, x);
      const bedWeight = zWeight * xWeight;
      return baseY + (STATION_SLEEPER_TOP_Y - baseY) * bedWeight;
    }
    return baseY;
  }

  return sampleWorldOuterTerrain(worldId, x, z);
}

function freezeObstacles(items: readonly WorldObstacleBox[]): readonly WorldObstacleBox[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

const WORLD_STATIC_OBSTACLES: Readonly<Record<WorldId, readonly WorldObstacleBox[]>> = {
  meadow: freezeObstacles([
    { id: "meadow-fence-left-north", x: -4.89, z: -1.64, halfW: 0.18, halfD: 0.7, height: 0.62 },
    { id: "meadow-fence-left-south", x: -4.96, z: 1.58, halfW: 0.12, halfD: 0.44, height: 0.62 },
    { id: "meadow-fence-right-north", x: 4.89, z: -1.64, halfW: 0.18, halfD: 0.7, height: 0.62 },
    { id: "meadow-fence-right-south", x: 4.96, z: 1.58, halfW: 0.12, halfD: 0.44, height: 0.62 },
    { id: "meadow-bush-front-left", x: -4.45, z: 1.8, halfW: 0.42, halfD: 0.38, height: 0.6 },
    { id: "meadow-bush-back-left", x: -3.25, z: -2.55, halfW: 0.46, halfD: 0.42, height: 0.68 },
    { id: "meadow-bush-back-right", x: 3.25, z: -2.65, halfW: 0.44, halfD: 0.4, height: 0.64 },
    { id: "meadow-tree-left", x: -3.9, z: -3.5, halfW: 0.48, halfD: 0.48, height: 2.65 },
    { id: "meadow-tree-right", x: 4.0, z: -3.7, halfW: 0.45, halfD: 0.45, height: 2.45 }
  ]),
  "peekaboo-barn": freezeObstacles([
    { id: "barn-fence-left-north", x: -4.8, z: -1.6, halfW: 0.17, halfD: 0.67, height: 0.68 },
    { id: "barn-fence-left-south", x: -4.73, z: 1.62, halfW: 0.14, halfD: 0.49, height: 0.68 },
    { id: "barn-fence-right-north", x: 4.78, z: -1.62, halfW: 0.16, halfD: 0.69, height: 0.68 },
    { id: "barn-fence-right-south", x: 4.73, z: 1.56, halfW: 0.14, halfD: 0.43, height: 0.68 },
    { id: "barn-bale-front-left", x: -3.85, z: 1.62, halfW: 0.36, halfD: 0.3, height: 0.42 },
    { id: "barn-bales-back-right", x: 3.88, z: -2.75, halfW: 0.68, halfD: 0.36, height: 0.84 },
    { id: "barn-wagon-wheel", x: 4.46, z: -1.55, halfW: 0.18, halfD: 0.46, height: 0.9 },
    { id: "barn-water-trough", x: 2.72, z: -3.52, halfW: 0.58, halfD: 0.32, height: 0.42 },
    { id: "barn-duck-pond", x: -3.4, z: -3.2, halfW: 1.18, halfD: 1.18, height: 0.35 }
  ]),
  "music-garden": freezeObstacles([
    { id: "music-stomp-left", x: -3.35, z: -1.25, halfW: 0.45, halfD: 0.45, height: 0.18 },
    { id: "music-stomp-back-left", x: -2.15, z: -2.52, halfW: 0.45, halfD: 0.45, height: 0.18 },
    { id: "music-stomp-back-center", x: 0, z: -2.72, halfW: 0.45, halfD: 0.45, height: 0.18 },
    { id: "music-stomp-back-right", x: 2.15, z: -2.52, halfW: 0.45, halfD: 0.45, height: 0.18 },
    { id: "music-stomp-right", x: 3.35, z: -1.25, halfW: 0.45, halfD: 0.45, height: 0.18 },
    { id: "music-bush-left", x: -3.65, z: -2.25, halfW: 0.44, halfD: 0.4, height: 0.64 },
    { id: "music-bush-right", x: 3.65, z: -2.25, halfW: 0.44, halfD: 0.4, height: 0.64 },
    { id: "music-lotus-pond", x: -4.95, z: -1.62, halfW: 1.08, halfD: 1.08, height: 0.3 },
    { id: "music-chime-post-left", x: -2.18, z: -4.48, halfW: 0.22, halfD: 0.22, height: 2.8 },
    { id: "music-chime-post-right", x: 2.18, z: -4.48, halfW: 0.22, halfD: 0.22, height: 2.8 }
  ]),
  station: freezeObstacles([
    { id: "station-platform", x: 3.25, z: -2.85, halfW: 2.5, halfD: 0.58, height: 0.22 },
    { id: "station-lamppost", x: 0.96, z: -2.92, halfW: 0.18, halfD: 0.18, height: 2.44 },
    { id: "station-waiting-bench", x: 1.68, z: -2.96, halfW: 0.71, halfD: 0.38, height: 1.82 },
    { id: "station-luggage-trolley", x: 2.84, z: -2.86, halfW: 0.44, halfD: 0.26, height: 0.8 },
    { id: "station-clock-post", x: 4.92, z: -2.98, halfW: 0.26, halfD: 0.16, height: 2.46 },
    { id: "station-semaphore", x: -2.92, z: -2.62, halfW: 0.24, halfD: 0.16, height: 1.92 },
    { id: "station-tunnel-wall-north", x: -5.55, z: -2.6, halfW: 0.62, halfD: 0.42, height: 1.85 },
    { id: "station-tunnel-wall-south", x: -5.55, z: -0.65, halfW: 0.62, halfD: 0.37, height: 1.85 },
    { id: "station-building", x: 3.45, z: -4.05, halfW: 1.45, halfD: 0.78, height: 2.75 }
  ]),
  "learning-cloud": freezeObstacles([
    { id: "cloud-pedestal-left", x: -3.42, z: -2.55, halfW: 0.48, halfD: 0.48, height: 0.52 },
    { id: "cloud-pedestal-center", x: 0, z: -3.25, halfW: 0.48, halfD: 0.48, height: 0.58 },
    { id: "cloud-pedestal-right", x: 3.42, z: -2.55, halfW: 0.48, halfD: 0.48, height: 0.52 },
    { id: "cloud-rim-left-north", x: -4.95, z: -2.05, halfW: 0.65, halfD: 0.72, height: 0.78 },
    { id: "cloud-rim-left-south", x: -4.85, z: 2.08, halfW: 0.65, halfD: 0.62, height: 0.52 },
    { id: "cloud-rim-right-north", x: 4.95, z: -2.05, halfW: 0.65, halfD: 0.72, height: 0.78 },
    { id: "cloud-rim-right-south", x: 4.85, z: 2.08, halfW: 0.65, halfD: 0.62, height: 0.52 }
  ]),
  "home-nook": freezeObstacles([
    { id: "nook-side-table", x: 3.85, z: -2.05, halfW: 0.51, halfD: 0.51, height: 0.7 },
    { id: "nook-reading-pouf", x: 2.95, z: -2.92, halfW: 0.36, halfD: 0.36, height: 0.54 },
    { id: "nook-floor-lamp", x: 3.58, z: -3.22, halfW: 0.28, halfD: 0.28, height: 2.06 },
    { id: "nook-potted-plant", x: -4.15, z: -2.55, halfW: 0.46, halfD: 0.44, height: 1.1 },
    { id: "nook-cubby-bookshelf", x: -3.72, z: -3.55, halfW: 0.74, halfD: 0.28, height: 1.28 },
    { id: "nook-back-wall", x: 0, z: -4.3, halfW: 5.6, halfD: 0.16, height: 4.0 }
  ]),
  "moonlit-nursery": freezeObstacles([
    { id: "nursery-bed", x: -3.45, z: -2.55, halfW: 0.62, halfD: 0.74, height: 0.72 },
    { id: "nursery-bookshelf", x: -3.78, z: -3.52, halfW: 0.76, halfD: 0.28, height: 1.4 },
    { id: "nursery-story-box", x: 3.48, z: -1.75, halfW: 0.34, halfD: 0.28, height: 0.42 },
    { id: "nursery-pouf", x: 3.12, z: -2.58, halfW: 0.32, halfD: 0.32, height: 0.46 },
    { id: "nursery-rocking-chair", x: 3.58, z: -3.12, halfW: 0.42, halfD: 0.46, height: 1.02 },
    { id: "nursery-back-wall", x: 0, z: -4.3, halfW: 5.6, halfD: 0.16, height: 4.0 }
  ]),
  "starlight-cloud": freezeObstacles([
    { id: "starlight-cushion-left", x: -3.38, z: -2.42, halfW: 0.28, halfD: 0.28, height: 0.28 },
    { id: "starlight-cushion-right", x: 3.38, z: -2.42, halfW: 0.28, halfD: 0.28, height: 0.28 },
    { id: "starlight-lantern-left", x: -3.52, z: -2.85, halfW: 0.42, halfD: 0.4, height: 1.94 },
    { id: "starlight-lantern-right", x: 3.52, z: -2.85, halfW: 0.42, halfD: 0.4, height: 1.94 },
    { id: "starlight-bolster-row", x: 0, z: -3.62, halfW: 2.05, halfD: 0.44, height: 0.4 },
    { id: "starlight-rim-left-north", x: -5.0, z: -2.05, halfW: 0.65, halfD: 0.72, height: 0.76 },
    { id: "starlight-rim-left-south", x: -4.9, z: 2.08, halfW: 0.65, halfD: 0.62, height: 0.5 },
    { id: "starlight-rim-right-north", x: 5.0, z: -2.05, halfW: 0.65, halfD: 0.72, height: 0.76 },
    { id: "starlight-rim-right-south", x: 4.9, z: 2.08, halfW: 0.65, halfD: 0.62, height: 0.5 }
  ])
};

const EMPTY_WORLD_OBSTACLES: readonly WorldObstacleBox[] = Object.freeze([]);

/**
 * Pure deterministic axis-aligned 2D XZ obstacle boxes for solid stage-adjacent
 * scenery, leaving every standard stage spot, the `offLeft`/`offRight` (`z ≈ 0.1`)
 * gateways, and `"station"`'s `z = -1.6` railway track & tunnel bore unobstructed.
 */
export function worldStaticObstacles(worldId: WorldId | null | undefined): readonly WorldObstacleBox[] {
  return worldId ? WORLD_STATIC_OBSTACLES[worldId] : EMPTY_WORLD_OBSTACLES;
}
