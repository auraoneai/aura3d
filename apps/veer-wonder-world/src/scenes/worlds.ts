// Wonder World worlds (PRD 04 D08-D13, PRD 02 section 3): the six places on
// the toy island. Each world file declares understated dressing (generated
// models such as trees, bushes, clouds, the barn or the station, plus
// primitives for the ground, hills and a few pastel details) so the
// characters stay focal. Dressing sits behind and beside the play area
// (x -2.6..2.6, z -1.8..1.4) and never between the camera and the cast.
// A dressing model that is not admitted, failed preload or is switched off
// with `?models=0` is drawn from its primitive stand-in recipe.

import { instances, material, model, primitives, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { modelRef, type ModelKey } from "../aura-assets.js";
import type { MusicBedId, WorldId } from "../types.js";
import type { Vec3 } from "./motion.js";
import { ASSET_TRAITS, buildStandIn, defaultHeightM, primitiveParams, type StandInShape } from "./stand-ins.js";
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
}

/** Many copies of one unit primitive in one draw call (piano keys, fence posts, sleepers). */
export interface DressingInstances {
  readonly kind: "instances";
  readonly shape: "box" | "sphere" | "cylinder";
  readonly name: string;
  readonly items: readonly { readonly at: Vec3; readonly size: Vec3; readonly rotation?: Vec3; readonly color: string }[];
  readonly roughness?: number;
  readonly castShadow?: boolean;
}

export type DressingItem = DressingModel | DressingPrimitive | DressingInstances;

export interface WorldDefinition {
  readonly id: WorldId;
  /** Working title for diagnostics and docs (child-facing names live in the locale packs). */
  readonly workingTitle: string;
  readonly ground: { readonly color: string; readonly size: number };
  readonly dressing: readonly DressingItem[];
  readonly musicBed: MusicBedId;
}

export const WORLDS: Readonly<Record<WorldId, WorldDefinition>> = {
  meadow,
  "music-garden": musicGarden,
  "peekaboo-barn": peekabooBarn,
  station,
  "learning-cloud": learningCloud,
  "home-nook": homeNook
};

export const WORLD_IDS: readonly WorldId[] = ["meadow", "music-garden", "peekaboo-barn", "station", "learning-cloud", "home-nook"];

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

export interface BuiltWorld {
  readonly nodes: readonly AuraNodeBuilder<AuraSceneNode>[];
  /** Dressing items drawn from their GLB. */
  readonly models: number;
  /** Dressing items drawn as primitive stand-ins. */
  readonly standIns: number;
}

function primitiveNode(item: DressingPrimitive, name: string): AuraNodeBuilder<AuraSceneNode> {
  const params = primitiveParams(item.shape, item.segments);
  const options = {
    name,
    size: item.size,
    position: item.at,
    rotation: item.rotation ?? [0, 0, 0],
    material: material.pbr({
      color: item.color,
      roughness: item.roughness ?? 0.9,
      metallic: 0,
      ...(item.emissive ? { emissive: item.emissive.color, emissiveIntensity: item.emissive.intensity } : {})
    }),
    castShadow: item.castShadow ?? false,
    receiveShadow: true,
    ...(params ? { params } : {})
  } as const;
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

function instancesNode(item: DressingInstances, name: string): AuraNodeBuilder<AuraSceneNode> {
  const options = {
    name,
    transforms: item.items.map((entry) => ({ position: entry.at, scale: entry.size, ...(entry.rotation ? { rotation: entry.rotation } : {}) })),
    colors: item.items.map((entry) => entry.color),
    // Per-instance colours carry the tint; the material stays white so colour is applied once.
    material: material.pbr({ color: "#ffffff", roughness: item.roughness ?? 0.85, metallic: 0 }),
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
 * Builds a world's ground and dressing. `available(key)` says whether a model may be
 * mounted (admitted, preloaded and not switched off); otherwise its stand-in is used.
 */
export function buildWorldNodes(id: WorldId, available: (key: ModelKey) => boolean): BuiltWorld {
  const world = WORLDS[id];
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  let models = 0;
  let standIns = 0;
  nodes.push(primitives.plane({
    name: `${id}:ground`,
    size: [world.ground.size, 1, world.ground.size],
    material: material.pbr({ color: world.ground.color, roughness: 0.95, metallic: 0 }),
    castShadow: false,
    receiveShadow: true
  }));
  world.dressing.forEach((item, index) => {
    const name = `${id}:dressing-${index}`;
    if (item.kind === "primitive") {
      nodes.push(primitiveNode(item, name));
      return;
    }
    if (item.kind === "instances") {
      nodes.push(instancesNode(item, `${id}:${item.name}`));
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
          ...(item.tint ? { materialOverrides: [{ color: item.tint, colorMode: traits.tintMode, ...(traits.tintMode === "replace" ? { replaceTextures: true } : {}) }] } : {})
        })
          .position(item.at)
          .rotate(0, item.yaw ?? 0, 0)
      );
      models += 1;
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
  return { nodes, models, standIns };
}
