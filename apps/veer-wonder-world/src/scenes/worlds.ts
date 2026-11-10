// Wonder World worlds (PRD 04 D08-D13, PRD 5.5.1 Section 4): the six sculpted
// Blender-Cycles miniature dioramas on the toy island. Each world combines a
// procedural felt/wood/cloud plinth (`y = 0.000` across the entire play area),
// spline paths/rails/rainbows, single-draw instanced flora/props, and real GLB
// dressing models (falling back cleanly to procedural stand-ins when offline).

import {
  instances,
  material,
  model,
  primitives,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { modelRef, type ModelKey } from "../aura-assets.js";
import type { MusicBedId, WorldId } from "../types.js";
import type { Vec3 } from "./motion.js";
import {
  ASSET_TRAITS,
  buildStandIn,
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
  warmPracticalGlowMat
} from "./diorama-terrain.js";
import { homeNook } from "./home-nook.js";
import { learningCloud } from "./learning-cloud.js";
import { meadow } from "./meadow.js";
import { musicGarden } from "./music-garden.js";
import { peekabooBarn } from "./peekaboo-barn.js";
import { station } from "./station.js";

/** A generated model used as scenery (stand-in when it cannot be drawn). */
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
  "home-nook": homeNook
};

export const WORLD_IDS: readonly WorldId[] = [
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook"
];

export function worldDefinition(id: WorldId): WorldDefinition {
  return WORLDS[id];
}

/** The model keys a world's dressing uses (for the preloader). Stable order, no duplicates. */
export function worldDressingKeys(id: WorldId): readonly ModelKey[] {
  const keys: ModelKey[] = [];
  for (const item of WORLDS[id].dressing) {
    if (item.kind === "model" && !keys.includes(item.key)) keys.push(item.key);
  }
  return keys;
}

export interface BuildWorldOptions {
  readonly reducedMotion?: boolean;
}

export interface WorldRuntimeHandleLike {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: readonly [number, number, number]): unknown;
}

export interface BuiltWorld {
  readonly id: WorldId;
  readonly nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[];
  /** Dressing items drawn from their GLB. */
  readonly models: number;
  /** Dressing items drawn as primitive stand-ins. */
  readonly standIns: number;
  /** Model keys mounted as GLBs in this world build. */
  readonly modelKeys: readonly ModelKey[];
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
 * Builds a world's diorama ground, procedural craft details, and dressing.
 * `available(key)` says whether a model may be mounted (admitted, preloaded
 * and not switched off); otherwise its stand-in is used.
 */
export function buildWorldNodes(
  id: WorldId,
  available: (key: ModelKey) => boolean,
  options: BuildWorldOptions = {}
): BuiltWorld {
  const world = WORLDS[id];
  const reducedMotion = options.reducedMotion ?? false;
  const diorama = world.buildDiorama
    ? world.buildDiorama({ reducedMotion, available })
    : { nodes: [], animated: [], replaceDefaultGround: false };

  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  let models = 0;
  let standIns = 0;
  const modelKeys: ModelKey[] = [];

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
    const ref = modelRef(item.key);
    if (ref && available(item.key)) {
      const traits = ASSET_TRAITS[item.key];
      nodes.push(
        model(ref, {
          name,
          targetHeight: heightM,
          scaleMode: "fit",
          castShadow: item.castShadow ?? true,
          receiveShadow: true,
          ...(item.tint
            ? {
                materialOverrides: [
                  {
                    color: item.tint,
                    colorMode: traits.tintMode,
                    ...(traits.tintMode === "replace" ? { replaceTextures: true } : {})
                  }
                ]
              }
            : {})
        })
          .position(item.at)
          .rotate(0, item.yaw ?? 0, 0)
      );
      models += 1;
      if (!modelKeys.includes(item.key)) modelKeys.push(item.key);
      return;
    }
    const built = buildStandIn(item.key, {
      id: name,
      heightM,
      ...(item.tint ? { tint: item.tint } : {}),
      base: item.at,
      yaw: item.yaw ?? 0,
      movable: false,
      castShadow: item.castShadow ?? true
    });
    nodes.push(...built.nodes);
    standIns += 1;
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
    models,
    standIns,
    modelKeys,
    animatedIds,
    sampleWorldMotion,
    updateWorld
  };
}

export const buildWorld = buildWorldNodes;
