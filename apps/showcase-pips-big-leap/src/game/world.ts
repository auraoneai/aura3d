// Pip's Big Leap — WorldSpec -> scene nodes + collision world.
//
// A world is lowered into (a) an `AuraSceneBuilder` that owns presentation and
// (b) a plain-data collision world the player controller simulates against.
// Both come from the same spec, so what you see is what you collide with.
//
// GU47 WP-16: the opt-in presentation (`?look=diorama`) is the felt-and-clay diorama (`diorama.ts`,
// per-world look table in `looks.ts`); `look: "original"` (`?look=original`) keeps the
// pre-GU47 scene exactly. The collision world is identical in both.

import {
  camera,
  effects,
  game,
  geometry,
  instances,
  looks,
  material,
  primitives,
  scene,
  type AuraSceneNode
} from "@aura3d/engine";
import { createFlipbookAtlas } from "@aura3d/engine/game";
import { deriveWorldMotion, type WorldMotion } from "./motion.js";
import { legacySlabGeometry, type SlabTransform as SlabTransformSpec } from "./legacySlab.js";
import {
  GATE_RING_MATERIAL,
  SLAB_RADIUS,
  CONTACT_SHADOWS,
  SURFACES,
  ambientEmitterNode,
  auroraNode,
  dioramaBase,
  dioramaName,
  type BaseTile,
  floraLayers,
  floraNodes,
  hazardMaterial,
  hemisphereNode,
  heroCapeGeometry,
  heroCapeMaterial,
  instancedSurface,
  lensFlareNode,
  millpondNodes,
  miniatureDofNode,
  practicalNodes,
  skyNode,
  courseBounds,
  slabTransforms,
  ssrNode,
  sunShaftsNode,
  vignetteNode
} from "./diorama.js";
import {
  MINIATURE_LIFT,
  baseDepthFor,
  lookOverridesFor,
  presentationScale,
  worldLook,
  type PipLookMode,
  type PresentationScale,
  type WorldLook
} from "./looks.js";
import type {
  CheckpointSpec, DecorSpec, HazardBox, HazardSpec, PickupSpec,
  PlatformKind, PlatSpec, SolidBox, SpringSpec, WaterSpec, WorldId, WorldSpec
} from "./types.js";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import {
  buildBossThornSpikeNode,
  buildBounceSpringCapNode,
  buildCheckpointPennantNode,
  buildDioramaStaticDecorNodes,
  buildGateLockStarNode,
  buildHazardFeatureNode,
  buildSingleDecorPropNode,
  buildSunGateRuneRingNode,
  buildUpdraftFanNode,
  buildWoodlandBannerNode,
  type StaticDecorKind,
  type StaticDecorPlacement
} from "../art/proceduralModels.js";
import {
  buildIdolBramblebackNode,
  buildIdolCheckpointStandNode,
  buildIdolDecorNodes,
  buildIdolGoldenAcornNode,
  buildIdolHeartBerryNode,
  buildIdolPipHeroNode,
  buildIdolSpringBaseNode,
  buildIdolSunGateArchNode,
  buildIdolSunseedNode,
  buildIdolVillagerNode,
  idolDecorKinds
} from "../art/idolModels.js";

type SceneBuilder = ReturnType<typeof scene>;
type SceneNodeArg = Parameters<SceneBuilder["add"]>[0];

/**
 * Procedural storybook island plinth dimensions per world (`surface` is the walkable top fraction).
 * Starfall Garden (w6), Basalt Cellar (w4), and Hollow Palace (w5) use terraced bluffs.
 */
export const BASE_TILES: Readonly<Partial<Record<WorldId, BaseTile>>> = {
  academy: { size: [1.898, 0.669, 1.618], surface: 0.45 },
  w1: { size: [1.722, 0.695, 1.903], surface: 0.39 },
  w2: { size: [1.89, 1.139, 1.902], surface: 0.3 },
  w3: { size: [1.884, 0.495, 1.897], surface: 0.58 }
};

/** The villager that stands in for each NPC runner in the diorama look: rounded 6-legged iridescent forest beetle + spiny hedgehog. */
export const VILLAGER_BY_WHO = {
  helper: { kind: "procedural-hedgehog", height: 1.25 },
  sidekick: { kind: "procedural-beetle", height: 0.52 }
} as const;

// ---------------------------------------------------------------- palettes

const KIND_STYLE: Record<PlatformKind, { readonly body: string; readonly top: string }> = {
  grass:     { body: "#6b4c35", top: "#3b7a3e" },
  earth:     { body: "#5c3f28", top: "#8c6342" },
  mushroom:  { body: "#d9ccb4", top: "#d14b38" },
  leaf:      { body: "#2f6333", top: "#4f9e52" },
  dock:      { body: "#6b4c35", top: "#9e7344" },
  wood:      { body: "#6b4c35", top: "#ad814c" },
  rope:      { body: "#7d6140", top: "#c49d62" },
  cloud:     { body: "#96adc8", top: "#dce9f7" },
  sky:       { body: "#5a82ab", top: "#9ec4e6" },
  stone:     { body: "#4a4541", top: "#736a61" },
  ember:     { body: "#3f271d", top: "#a8522c" },
  metal:     { body: "#343640", top: "#686e80" },
  marble:    { body: "#a89d8e", top: "#dfd4c0" },
  gold:      { body: "#7c5f26", top: "#dfb44b" },
  crystal:   { body: "#4f3f85", top: "#9787de" },
  starlight: { body: "#322c58", top: "#c7b6ff" }
};

const HAZARD_STYLE: Record<HazardSpec["type"], string> = {
  thorns: "#8a3c68",
  lava:   "#ff5a26",
  ember:  "#ff9435",
  frost:  "#6fd8ff"
};

// ---------------------------------------------------------------- names

/** Capture tooling: `?qa-pose=1` publishes Pip's posed (skinned) bounds per frame for the motion audit (CPU cost, QA only). */
const QA_POSE_EVIDENCE = typeof window !== "undefined" && new URLSearchParams(window.location?.search ?? "").get("qa-pose") === "1";

export const nodeName = {
  platform: (id: string) => `plat:${id}`,
  platformTop: (id: string) => `plat-top:${id}`,
  seed: (id: string) => `seed:${id}`,
  acorn: (id: string) => `acorn:${id}`,
  heart: (id: string) => `heart:${id}`,
  spring: (id: string) => `spring:${id}`,
  checkpoint: (id: string) => `cp:${id}`,
  checkpointFlag: (id: string) => `cp-flag:${id}`,
  gate: "sun-gate",
  gateRing: "sun-gate-ring",
  gateLock: "sun-gate-lock",
  hero: "pip",
  heroCape: "pip:cape",
  dropShadow: "pbl-drop-shadow",
  landingRing: "pbl-landing-ring",
  boss: "brambleback",
  bossSpike: (i: number) => `bramble-spike:${i}`,
  npc: (id: string) => `npc:${id}`,
  water: (id: string) => `water:${id}`
} as const;

// ---------------------------------------------------------------- spec -> collision

export interface WaterZone {
  readonly spec: WaterSpec;
  readonly x: number; readonly z: number;
  readonly hx: number; readonly hz: number;
  readonly surfaceY: number;
  readonly floorY: number;
}

/**
 * Coarse cylinder used only by the follow camera to shorten its boom when a
 * trunk/boulder would sit between Pip and the lens. This is plain data built
 * once at world build time — never a per-frame raycast.
 */
export interface CameraObstacle {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly radius: number;
  readonly height: number;
}

export interface BuiltWorld {
  readonly spec: WorldSpec;
  readonly motion: WorldMotion;
  readonly scene: SceneBuilder;
  readonly solids: readonly SolidBox[];
  readonly hazards: readonly HazardBox[];
  readonly waters: readonly WaterZone[];
  readonly seeds: readonly PickupSpec[];
  readonly acorns: readonly PickupSpec[];
  readonly hearts: readonly PickupSpec[];
  readonly springs: readonly SpringSpec[];
  readonly checkpoints: readonly CheckpointSpec[];
  readonly spinNodes: readonly string[];
  readonly movingSolids: readonly SolidBox[];
  readonly timedSolids: readonly SolidBox[];
  readonly cameraObstacles: readonly CameraObstacle[];
  readonly bossArenaZ: number | null;
  /** GU47 WP-16 presentation facts (never read by the sim). */
  readonly presentation: WorldPresentation;
}

const PLAT_H = 0.55;

function solidOf(p: PlatSpec): SolidBox {
  const h = p.h ?? PLAT_H;
  return {
    id: p.id,
    x: p.x,
    y: p.y - h / 2,
    z: p.z,
    hx: p.w / 2,
    hy: h / 2,
    hz: p.d / 2,
    plat: p,
    active: true,
    vx: 0, vy: 0, vz: 0
  };
}

// ---------------------------------------------------------------- decor

/**
 * Today's decor, one model node per prop (`?look=original`). The diorama look draws the
 * same props through `decorInstance` + `propInstanceNodes` (PBL-PF1), where the small
 * props (crates, barrels, banners, star cores) cast no shadow-map shadows.
 */
function decorNodes(d: DecorSpec, tinyShadows = true): readonly SceneNodeArg[] {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;

  switch (d.kind) {
    case "tree":
      return [buildSingleDecorPropNode(`${d.id}:tree`, "tree", [d.x, d.y, d.z], yaw, s, true)];
    case "conifer":
      return [buildSingleDecorPropNode(`${d.id}:conifer`, "conifer", [d.x, d.y, d.z], yaw, s, true)];
    case "hawk":
      return [buildSingleDecorPropNode(`${d.id}:hawk`, "hawk", [d.x, d.y, d.z], yaw, s, true)];
    case "mushroom":
      return [buildSingleDecorPropNode(`${d.id}:mushroom`, "mushroom", [d.x, d.y, d.z], yaw, s, true)];
    case "flower":
      return [buildSingleDecorPropNode(`${d.id}:flower`, "flower", [d.x, d.y, d.z], yaw, s, false)];
    case "rock":
      return [buildSingleDecorPropNode(`${d.id}:rock`, "rock", [d.x, d.y, d.z], yaw, s, true)];
    case "windmill":
      return [buildSingleDecorPropNode(`${d.id}:windmill`, "windmill", [d.x, d.y, d.z], yaw, s, true)];
    case "sail":
      return [buildSingleDecorPropNode(`${d.id}:sail`, "sail", [d.x, d.y, d.z], yaw, s, true)];
    case "cloud":
      return [buildSingleDecorPropNode(`${d.id}:cloud`, "cloud", [d.x, d.y, d.z], yaw, s, false)];
    case "fan":
      return [buildUpdraftFanNode(`${d.id}:fan`, [d.x, d.y, d.z], yaw, s)];
    case "vent":
      return [buildSingleDecorPropNode(`${d.id}:vent`, "vent", [d.x, d.y, d.z], yaw, s, true)];
    case "pillar":
      return [buildSingleDecorPropNode(`${d.id}:pillar`, "pillar", [d.x, d.y, d.z], yaw, s, true)];
    case "arch":
      return [buildSingleDecorPropNode(`${d.id}:arch`, "arch", [d.x, d.y, d.z], yaw, s, true)];
    case "crystal":
      return [buildSingleDecorPropNode(`${d.id}:crystal`, "crystal", [d.x, d.y, d.z], yaw, s, true)];
    case "star":
      return [buildSingleDecorPropNode(`${d.id}:star`, "star", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "lantern":
      return [buildSingleDecorPropNode(`${d.id}:lantern`, "lantern", [d.x, d.y, d.z], yaw, s, true)];
    case "crate":
      return [buildSingleDecorPropNode(`${d.id}:crate`, "crate", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "barrel":
      return [buildSingleDecorPropNode(`${d.id}:barrel`, "barrel", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "banner":
      return [buildWoodlandBannerNode(`${d.id}:banner`, [d.x, d.y, d.z], yaw, s)];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- world build

/**
 * Only solid trunks, boulders, and course-side jambs/pillars tall enough to
 * intersect the raised boom become camera obstacles. Open portals (`arch`)
 * register their left and right jamb pillars only so the central walkway and
 * adjacent checkpoints stay completely unobstructed.
 */
/** Idol decor sinks this far into whatever it stands on, so turf discs and roots never show a gap. */
export const IDOL_DECOR_SINK = 0.12;
const FLYING_DECOR: ReadonlySet<string> = new Set(["cloud", "hawk", "star"]);

/**
 * Idol wow pass grounding (GPU QA): an Idol prop standing over a static platform sits on that platform's top, sampled
 * under its footprint (centre + 4 points at 0.3 m x scale), sunk IDOL_DECOR_SINK. Only tops within 2.2 m below / 0.4 m
 * above the authored y count, so flank props on their own turf islands keep their authored height. A lantern authored
 * inside the Sun-Gate opening (it would hang through the rune ring) stands beside the right pillar instead.
 * Render only: the placement feeds the model node, never a collider.
 */
export function groundIdolDecor(d: StaticDecorPlacement, solids: readonly SolidBox[], gate: { readonly x: number; readonly y: number; readonly z: number }): StaticDecorPlacement {
  if (FLYING_DECOR.has(d.kind)) return d;
  const s = d.s ?? 1;
  let { x, y, z } = d;
  if (d.kind === "lantern" && Math.abs(x - gate.x) < 1.6 && Math.abs(z - gate.z) < 1.2) {
    x = gate.x + 2.75;
    y = gate.y;
  }
  const r = 0.3 * s;
  let top = -Infinity;
  for (const [sx, sz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    for (const b of solids) {
      if (b.plat?.mover || b.plat?.timed || b.decor) continue;
      if (Math.abs(x + sx - b.x) > b.hx || Math.abs(z + sz - b.z) > b.hz) continue;
      const t = b.y + b.hy;
      if (t <= y + 0.4 && t >= y - 2.2 && t > top) top = t;
    }
  }
  return Number.isFinite(top) ? { ...d, x, y: top - IDOL_DECOR_SINK, z } : { ...d, x, y, z };
}

/** One solid body of a decor prop, in the prop's local frame before yaw and scale (metres, base at the placement). */
export interface DecorBody {
  readonly cx: number;
  readonly cz: number;
  readonly hx: number;
  readonly hz: number;
  /** Height of the body above its base. */
  readonly h: number;
  /** Base offset (rocks and crystals sink like their Idol models). */
  readonly dy?: number;
}

/**
 * Pass-through pass (owner, 2026-11-18: "it just runs right through rather than stopping"): the solid body of every
 * solid-looking decor kind, measured on the Idol GLB the default look draws (vertex extents in the 0.2-1.0 m band, the
 * height Pip's 0.9 m box sweeps; round props trimmed ~10 % so the box sits inside the silhouette). Flowers, clouds,
 * hawks and star relics stay walk-through (soft or flying). Arches collide on their two jambs only, so the opening stays
 * open; banners and the Sun-Gate are handled as poles/jambs.
 */
export const DECOR_BODIES: Readonly<Partial<Record<DecorSpec["kind"], readonly DecorBody[]>>> = {
  // pipOakTree: gnarled root-flared trunk ring x -1.38..1.33, z -0.73..1.92 (trunk sits 0.55 m behind the canopy centre).
  tree: [{ cx: 0, cz: 0.55, hx: 1.2, hz: 1.2, h: 4.99 }],
  // pipConifer: skirt of low boughs reaches +-1.1..1.4 m from 0.5 m up; trunk +-0.45 below that.
  conifer: [{ cx: 0, cz: 0, hx: 1.0, hz: 1.0, h: 3.88 }],
  // pipToadstool: cap +-0.58 m from 0.5 m up (stem +-0.3 under it).
  mushroom: [{ cx: 0, cz: 0, hx: 0.5, hz: 0.5, h: 1.34 }],
  // pipBoulder 1.43 x 1.14 x 1.45, drawn 0.1 m sunk.
  rock: [{ cx: 0, cz: 0, hx: 0.62, hz: 0.64, h: 1.14, dy: -0.1 }],
  // pipStonePillar 0.995 x 2.98 x 1.055.
  pillar: [{ cx: 0, cz: -0.04, hx: 0.47, hz: 0.49, h: 2.98 }],
  // pipStoneArch: jambs x +-(0.8..2.0), z +-0.73; the 1.6 m opening between them stays open.
  arch: [
    { cx: -1.4, cz: 0, hx: 0.6, hz: 0.72, h: 4.13 },
    { cx: 1.4, cz: 0, hx: 0.6, hz: 0.72, h: 4.13 }
  ],
  // pipWatchtower: frame x -1.11..1.09, z -1.35..1.5.
  sail: [{ cx: 0, cz: 0.07, hx: 1.05, hz: 1.4, h: 5.56 }],
  // pipWindmillTower body (the sail disc hangs high in front; see cameraObstaclesFor).
  windmill: [{ cx: 0, cz: 0, hx: 1.3, hz: 1.3, h: 4.7 }],
  // pipCrate 0.96 x 0.88 x 1.14 (boxy: full size).
  crate: [{ cx: 0, cz: 0, hx: 0.48, hz: 0.569, h: 0.88 }],
  // pipBarrel 0.79 x 0.98 x 0.79.
  barrel: [{ cx: 0, cz: 0, hx: 0.37, hz: 0.37, h: 0.98 }],
  // pipLantern: plinth +-0.72 under 0.5 m, post above it.
  lantern: [{ cx: -0.04, cz: 0, hx: 0.68, hz: 0.68, h: 2.41 }],
  // pipCrystal 1.31 x 1.5 x 1.33, drawn 0.12 m sunk.
  crystal: [{ cx: 0, cz: 0, hx: 0.6, hz: 0.62, h: 1.5, dy: -0.12 }],
  // pipEmberVent 1.64 x 0.92 x 1.63.
  vent: [{ cx: 0, cz: 0, hx: 0.78, hz: 0.78, h: 0.92 }],
  // Woodland banner: 0.055 m timber pole, 2.15 m tall (the cloth hangs from 0.92 m, above Pip's head).
  banner: [{ cx: 0, cz: 0, hx: 0.06, hz: 0.06, h: 2.15 }],
  // Updraft fan: stone ring radius 1.1 m, 0.53 m tall.
  fan: [{ cx: 0, cz: 0, hx: 0.95, hz: 0.95, h: 0.53 }]
};

/** Sun-Gate (pipSunGate, drawn 0.17 m behind the gate point): two jambs x +-(1.25..2.22), z +-0.55, 3.31 m tall. */
export const SUN_GATE_JAMBS: readonly DecorBody[] = [
  { cx: -1.74, cz: -0.17, hx: 0.48, hz: 0.5, h: 3.31 },
  { cx: 1.74, cz: -0.17, hx: 0.48, hz: 0.5, h: 3.31 }
];

/** True when (x, y, z) stands on (within 0.25 m of) a static platform top. */
function standsOnPlatform(d: { readonly x: number; readonly y: number; readonly z: number }, solids: readonly SolidBox[]): boolean {
  return solids.some((b) => !b.decor && !b.plat?.mover && !b.plat?.timed && Math.abs(d.x - b.x) <= b.hx && Math.abs(d.z - b.z) <= b.hz && Math.abs(b.y + b.hy - d.y) <= 0.25);
}

/** World-space AABB of one body placed at (x, y, z) with yaw and uniform scale. */
export function decorBodyBox(b: DecorBody, x: number, y: number, z: number, yaw: number, s: number): { x: number; y: number; z: number; hx: number; hy: number; hz: number } {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const ox = (b.cx * c + b.cz * sn) * s, oz = (-b.cx * sn + b.cz * c) * s;
  const hx = (Math.abs(c) * b.hx + Math.abs(sn) * b.hz) * s, hz = (Math.abs(sn) * b.hx + Math.abs(c) * b.hz) * s;
  const base = y + (b.dy ?? 0) * s;
  return { x: x + ox, y: base + (b.h * s) / 2, z: z + oz, hx, hy: (b.h * s) / 2, hz };
}

/**
 * Collision bodies for the solid decor and the Sun-Gate jambs (pass-through pass). Props are placed exactly where the
 * default look draws them: static props through `groundIdolDecor` (same platform solids, same lantern relocation),
 * banners and fans at their authored spot. Identical in both looks (the collision world never depends on the look).
 */
export function decorColliders(spec: WorldSpec, platformSolids: readonly SolidBox[]): SolidBox[] {
  const out: SolidBox[] = [];
  const push = (id: string, box: ReturnType<typeof decorBodyBox>) => {
    out.push({
      id, x: box.x, y: box.y, z: box.z, hx: box.hx, hy: box.hy, hz: box.hz,
      plat: { id, x: box.x, y: box.y + box.hy, z: box.z, w: box.hx * 2, d: box.hz * 2, h: box.hy * 2, kind: "stone" },
      active: true, vx: 0, vy: 0, vz: 0, decor: true
    });
  };
  for (const d of spec.decor) {
    const bodies = DECOR_BODIES[d.kind];
    if (!bodies) continue;
    const placed = ANIMATED_DECOR_KINDS.has(d.kind)
      ? d
      : groundIdolDecor({ kind: d.kind as StaticDecorKind, x: d.x, y: d.y, z: d.z, yaw: d.yaw, s: d.s }, platformSolids, spec.gate);
    // Banners hung over the Sun-Gate (pole foot >= 1 m above the floor, above Pip's head) are not on the run line.
    if (d.kind === "banner" && !standsOnPlatform(placed, platformSolids)) continue;
    bodies.forEach((b, i) => push(`decor:${d.id}${bodies.length > 1 ? `:${i}` : ""}`, decorBodyBox(b, placed.x, placed.y, placed.z, d.yaw ?? 0, d.s ?? 1)));
  }
  const g = spec.gate;
  SUN_GATE_JAMBS.forEach((b, i) => push(`decor:sun-gate:${i}`, decorBodyBox(b, g.x, g.y, g.z, 0, 1)));
  return out;
}

function cameraObstaclesFor(d: DecorSpec): readonly CameraObstacle[] {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;
  switch (d.kind) {
    // Idol wow pass (GPU QA): radii/heights follow the Idol set pieces, which are chunkier than the old procedural ones.
    case "tree":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.55 * s, height: 3.0 * s }];
    case "conifer":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.45 * s, height: 3.2 * s }];
    case "rock":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.52 * s, height: 1.05 * s }];
    case "windmill": {
      // Tower body (Idol pipWindmillTower: ~1.3 m radius x 4.7 m) plus the sail disc hung 1.62 m in front of it.
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      return [
        { x: d.x, z: d.z, baseY: d.y, radius: 1.35 * s, height: 4.7 * s },
        { x: d.x + fx * 1.62 * s, z: d.z + fz * 1.62 * s, baseY: d.y + 1.0 * s, radius: 1.0 * s, height: 3.9 * s }
      ];
    }
    case "sail":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 1.1 * s, height: 5.56 * s }];
    case "lantern":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.4 * s, height: 2.4 * s }];
    case "pillar":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.52 * s, height: 3.4 * s }];
    case "arch": {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const jx = 1.71 * s;
      return [
        { x: d.x - cy * jx, z: d.z + sy * jx, baseY: d.y, radius: 0.34 * s, height: 3.35 * s },
        { x: d.x + cy * jx, z: d.z - sy * jx, baseY: d.y, radius: 0.34 * s, height: 3.35 * s }
      ];
    }
    case "crystal":
      return [{ x: d.x, z: d.z, baseY: d.y, radius: 0.48 * s, height: 1.9 * s }];
    default:
      return [];
  }
}

export interface BuildWorldOptions {
  /**
   * QA only (`?pbl-ao=0`): drop the look's ambient-occlusion node so a capture
   * can pair AO on and off at the same frame (LIGHT-06). Default true.
   */
  readonly ambientOcclusion?: boolean;
  /** GU47 WP-16: the felt-and-clay diorama (`?look=diorama`) or today's scene (default since the blind-panel pass). */
  readonly look?: PipLookMode;
  /** PRD 6.3: halve the ambient emission and cap flora sway at 30%. */
  readonly reducedMotion?: boolean;
}

/** Presentation facts the runtime and the evidence read (diorama look only). */
export interface WorldPresentation {
  readonly mode: PipLookMode;
  readonly look: WorldLook;
  /** Top of the diorama base (PBL-E1), null in the original look. */
  readonly baseTop: number | null;
  /** Practical light node names (PBL-L2 flicker), with their authored intensity and flicker depth. */
  readonly practicals: readonly { readonly name: string; readonly intensity: number; readonly flicker: number }[];
  /** Instanced flora tufts (PBL-W1). */
  readonly floraCount: number;
  /** Static platforms drawn through instanced slabs (PBL-PF1). */
  readonly instancedPlatforms: number;
  /** PBL-AN1: decor the presentation sways (banners) or spins (updraft fans), one runtime node each. */
  readonly animatedDecor: readonly AnimatedDecor[];
  /** PBL-AN1: instanced leaf-pad draws that bob a few centimetres (visual only; colliders stay). */
  readonly bobNodes: readonly string[];
}

/** PBL-AN1: one decor prop the presentation moves (visual only). */
export interface AnimatedDecor {
  readonly name: string;
  /** banner sways, fan spins (PBL-AN1); Idol windmill sails spin, hawks circle and clouds drift (moving-parts pass). */
  readonly kind: "banner" | "fan" | "sails" | "hawk" | "cloud" | "villager";
  readonly yaw: number;
  /** Seeded from the decor id so neighbours do not move in lockstep. */
  readonly phase: number;
  /** Rest position of the moving node (hawks and clouds move away from and back to it). */
  readonly base?: readonly [number, number, number];
  readonly scale?: number;
}

/** Decor kinds the diorama animates instead of instancing (PBL-AN1). */
export const ANIMATED_DECOR_KINDS: ReadonlySet<DecorSpec["kind"]> = new Set(["banner", "fan"]);

/** Platform kinds whose static instanced draws bob (PBL-AN1 "bobbing leaf pads"). */
export const BOBBING_PLATFORM_KINDS: ReadonlySet<PlatformKind> = new Set(["leaf"]);

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6283) / 1000;
}

/**
 * PBL-AN1: a banner or updraft fan as its own runtime model node, at today's asset, place,
 * yaw and fitted size, so the presentation can sway or spin it. Banners stay out of the
 * shadow map like the other tiny props.
 */
function animatedDecorNode(d: DecorSpec): SceneNodeArg {
  const s = d.s ?? 1;
  const name = `${d.id}:${d.kind}`;
  const rt = game.runtimeNode(name, { tags: ["decor"] });
  if (d.kind === "banner") {
    return buildWoodlandBannerNode(name, [d.x, d.y, d.z], d.yaw ?? 0, s, rt);
  }
  return buildUpdraftFanNode(name, [d.x, d.y, d.z], d.yaw ?? 0, s, rt);
}

/** Today's atmosphere (`?look=original`), unchanged. */
function addOriginalAtmosphere(builder: SceneBuilder, spec: WorldSpec, options: BuildWorldOptions): void {
  const skyColor = spec.background ?? "#1e4d78";
  // Look preset — fog itself is authored below so its color tracks the sky
  // exactly instead of the preset's generic haze tint. No `background` override: since
  // GU47 E-A (9001eb1f8) a colour background hides the look's HDRI, and that HDRI is the
  // light sky 4.6.2 drew behind every world (the override turned it into a flat navy wall).
  const look = looks.preset(spec.look as Parameters<typeof looks.preset>[0], { fogDensityScale: 0 });
  if (options.ambientOcclusion === false) {
    const group = look.toJSON();
    builder.add({ ...group, children: group.children.filter((child) => (child as { readonly name?: string }).name !== "look ambient occlusion") });
  } else {
    builder.add(look);
  }
  // Subtle distant atmospheric depth (`near >= 130, maxOpacity <= 0.10`) so the sunlit meadow & course pop crisply.
  builder.add(effects.fog({ mode: "linear", color: skyColor, near: 130, far: 420, maxOpacity: 0.10 }));
  // Grounding for Pip, pickups, and the course props: since 4.5.0 a
  // screen-space mask that darkens the shadow-casting look key light.
  builder.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }));
  if (spec.ambientFx === "embers" || spec.ambientFx === "stars") {
    builder.add(effects.bloom({ intensity: 0.28 }));
  }
  if (spec.ambientFx === "snow") builder.add(effects.snow({}));
}

/**
 * The diorama atmosphere: sun shafts first (so the look's height fog stays the active fog
 * node), the per-world look (E-A overrides: HDRI, PCSS key, rim, base height fog, grade,
 * post preset), hemisphere, practicals, lens flare, sky, contact shadows, the diorama base,
 * vignette, the miniature DOF and the ambient emitter. The authored extra bloom is gone
 * (PBL-P1): the look's bloom is the only one.
 */
const PIP_FLIPBOOK_ATLASES = {
  dust: createFlipbookAtlas("dust", [228, 210, 174]),
  sparks: createFlipbookAtlas("sparks", [255, 216, 98]),
  ripple: createFlipbookAtlas("ripple", [255, 206, 86])
} as const;

function addDioramaAtmosphere(builder: SceneBuilder, spec: WorldSpec, look: WorldLook, depth: number, options: BuildWorldOptions, scale: PresentationScale): number {
  const shafts = sunShaftsNode(look);
  if (shafts) builder.add(shafts);
  const base = dioramaBase(spec, look, depth, BASE_TILES[spec.id]);
  const course = courseBounds(spec);
  const shadowFit = {
    center: [
      Number(((course.minX + course.maxX) * 0.5).toFixed(2)),
      Number(((course.floorY + course.topY) * 0.5).toFixed(2)),
      Number(((course.minZ + course.maxZ) * 0.5).toFixed(2))
    ] as readonly [number, number, number],
    extent: Math.max(24, Number((Math.max(course.maxX - course.minX, course.maxZ - course.minZ) * 0.54).toFixed(2))),
    depth: 65
  };
  const preset = looks.preset(look.baseLook, lookOverridesFor(look, base.top, shadowFit));
  if (options.ambientOcclusion === false) {
    const group = preset.toJSON();
    builder.add({ ...group, children: group.children.filter((child) => (child as { readonly name?: string }).name !== "look ambient occlusion") });
  } else {
    builder.add(preset);
  }
  builder.add(hemisphereNode(look));
  for (const node of practicalNodes(look)) builder.add(node);
  const flare = lensFlareNode(look);
  if (flare) builder.add(flare);
  const sky = skyNode(look, [(course.minX + course.maxX) / 2, course.floorY, (course.minZ + course.maxZ) / 2]);
  if (sky) builder.add(sky);
  const aurora = auroraNode(spec, look, scale);
  if (aurora) builder.add(aurora);
  const ssr = ssrNode(look);
  if (ssr) builder.add(ssr);
  for (const n of millpondNodes(spec, look, scale.motion)) builder.add(n);
  builder.add(effects.contactShadows(CONTACT_SHADOWS));
  for (const node of base.nodes) builder.add(node);
  builder.add(vignetteNode(look));
  if (look.lens !== "none") builder.add(miniatureDofNode());
  builder.add(ambientEmitterNode(look, scale, nodeName.hero, 4700 + spec.order));
  for (let slot = 0; slot < 3; slot += 1) {
    const dustBase = effects
      .flipbook({
        name: dioramaName.flipbookDust(slot),
        texture: PIP_FLIPBOOK_ATLASES.dust.texture,
        spriteColumns: PIP_FLIPBOOK_ATLASES.dust.columns,
        spriteRows: PIP_FLIPBOOK_ATLASES.dust.rows,
        frameRate: 30,
        loop: false,
        size: 0.78,
        opacity: 0.85,
        color: look.dust,
        blend: "alpha"
      })
      .position(0, -120, 0)
      .runtime(game.runtimeNode(dioramaName.flipbookDust(slot), { tags: ["vfx"] }));
    builder.add(
      new (dustBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof dustBase)({
        ...dustBase.toJSON(),
        visible: false
      })
    );
    const sparksBase = effects
      .flipbook({
        name: dioramaName.flipbookSparks(slot),
        texture: PIP_FLIPBOOK_ATLASES.sparks.texture,
        spriteColumns: PIP_FLIPBOOK_ATLASES.sparks.columns,
        spriteRows: PIP_FLIPBOOK_ATLASES.sparks.rows,
        frameRate: 34,
        loop: false,
        size: 0.72,
        opacity: 0.94,
        color: "#ffd96a",
        blend: "additive"
      })
      .position(0, -120, 0)
      .runtime(game.runtimeNode(dioramaName.flipbookSparks(slot), { tags: ["vfx"] }));
    builder.add(
      new (sparksBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof sparksBase)({
        ...sparksBase.toJSON(),
        visible: false
      })
    );
    const rippleBase = effects
      .flipbook({
        name: dioramaName.flipbookRipple(slot),
        texture: PIP_FLIPBOOK_ATLASES.ripple.texture,
        spriteColumns: PIP_FLIPBOOK_ATLASES.ripple.columns,
        spriteRows: PIP_FLIPBOOK_ATLASES.ripple.rows,
        frameRate: 30,
        loop: false,
        size: 1.05,
        opacity: 0.92,
        color: "#ffc23d",
        blend: "additive"
      })
      .position(0, -120, 0)
      .runtime(game.runtimeNode(dioramaName.flipbookRipple(slot), { tags: ["vfx"] }));
    builder.add(
      new (rippleBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof rippleBase)({
        ...rippleBase.toJSON(),
        visible: false
      })
    );
  }
  return base.top;
}

/**
 * PBL-M1 + PBL-PF1: static platforms of one kind share two instanced rounded-slab draws
 * (clay body, felt top); movers and timed platforms keep their own runtime nodes so
 * `tickPlatforms` can move and hide them exactly as before.
 */
/**
 * Lane 521: the worlds whose 4.7.18 look depended on the 4.7.18 slab normals (see legacySlab.ts):
 * Whispering Forest (shaded lawn edges and nap bands) and Starfall Garden (the dark mirrored rim on
 * the crystal slabs). Their static slabs draw as one world-space mesh per kind with those normals;
 * every other world keeps the instanced slabs and today's look.
 */
export const LEGACY_SLAB_NORMAL_WORLDS: ReadonlySet<WorldId> = new Set<WorldId>(["w1", "w6"]);

function addDioramaPlatforms(builder: SceneBuilder, spec: WorldSpec, bobNodes: string[]): number {
  const groups = new Map<PlatformKind, { body: ReturnType<typeof slabTransforms>["body"][]; top: ReturnType<typeof slabTransforms>["top"][] }>();
  let instanced = 0;
  for (const p of spec.platforms) {
    const kind = p.kind ?? "grass";
    const surface = SURFACES[kind];
    const slab = slabTransforms(p, PLAT_H);
    if (p.mover || p.timed) {
      const h = p.h ?? PLAT_H;
      builder.add(
        primitives.roundedBox({ name: nodeName.platform(p.id), size: [p.w, h, p.d], position: [p.x, p.y - h / 2, p.z], params: { radius: SLAB_RADIUS }, material: surface.body, castShadow: true, receiveShadow: true })
          .runtime(game.runtimeNode(nodeName.platform(p.id), { tags: ["platform"] }))
      );
      builder.add(
        primitives.roundedBox({ name: nodeName.platformTop(p.id), size: [p.w * 0.98, 0.12, p.d * 0.98], position: [p.x, p.y - 0.05, p.z], params: { radius: 0.05 }, material: surface.top, receiveShadow: true })
          .runtime(game.runtimeNode(nodeName.platformTop(p.id), { tags: ["platform"] }))
      );
      continue;
    }
    let group = groups.get(kind);
    if (!group) groups.set(kind, (group = { body: [], top: [] }));
    group.body.push(slab.body);
    group.top.push(slab.top);
    instanced += 1;
  }
  for (const [kind, group] of groups) {
    const surface = SURFACES[kind];
    const legacy = LEGACY_SLAB_NORMAL_WORLDS.has(spec.id);
    const body = legacy
      ? geometry.custom(geometry.define(legacySlabGeometry(group.body as readonly SlabTransformSpec[], SLAB_RADIUS)), { name: `plats:${kind}`, material: surface.body, castShadow: true, receiveShadow: true })
      : instances.roundedBox({ name: `plats:${kind}`, transforms: group.body, params: { radius: SLAB_RADIUS }, material: instancedSurface(surface.body), castShadow: true, receiveShadow: true });
    const top = legacy
      ? geometry.custom(geometry.define(legacySlabGeometry(group.top as readonly SlabTransformSpec[], 0.3)), { name: `plat-tops:${kind}`, material: surface.top, castShadow: false, receiveShadow: true })
      : instances.roundedBox({ name: `plat-tops:${kind}`, transforms: group.top, params: { radius: 0.3 }, material: instancedSurface(surface.top), castShadow: false, receiveShadow: true });
    if (BOBBING_PLATFORM_KINDS.has(kind)) {
      // PBL-AN1: the leaf pads bob as one draw each; the instance transforms are world
      // space, so the node's own position is the bob offset.
      builder.add(body.runtime(game.runtimeNode(`plats:${kind}`, { tags: ["decor"] })));
      builder.add(top.runtime(game.runtimeNode(`plat-tops:${kind}`, { tags: ["decor"] })));
      bobNodes.push(`plats:${kind}`, `plat-tops:${kind}`);
    } else {
      builder.add(body);
      builder.add(top);
    }
  }
  return instanced;
}

export function buildWorld(spec: WorldSpec, options: BuildWorldOptions = {}): BuiltWorld {
  const motion = deriveWorldMotion(spec);
  const mode: PipLookMode = options.look ?? "diorama";
  const diorama = mode === "diorama";
  const look = worldLook(spec.id);
  const scale = presentationScale(options.reducedMotion === true);
  const builder = scene().background(diorama && !look.hdriSky ? look.background : (spec.background ?? "#1e4d78"));
  const baseTop = diorama ? addDioramaAtmosphere(builder, spec, look, baseDepthFor(spec), options, scale) : null;
  if (!diorama) addOriginalAtmosphere(builder, spec, options);

  // NOTE: the Kenney "world" backdrop GLBs ship with kit-space bounds that
  // scale into enormous near-field slabs (the floating moss patch in the
  // previous build). The fog + tree line now own the horizon, so those
  // backdrops are intentionally not mounted.

  // Platforms (presentation per look; the collision list is the same spec walk for both).
  const solids: SolidBox[] = [];
  const moving: SolidBox[] = [];
  const timed: SolidBox[] = [];
  const bobNodes: string[] = [];
  const animatedDecor: AnimatedDecor[] = [];
  const instancedPlatforms = diorama ? addDioramaPlatforms(builder, spec, bobNodes) : 0;
  for (const p of spec.platforms) {
    if (!diorama) {
      const style = KIND_STYLE[p.kind ?? "grass"];
      const h = p.h ?? PLAT_H;
      const plat = primitives.box({
        name: nodeName.platform(p.id),
        size: [p.w, h, p.d],
        position: [p.x, p.y - h / 2, p.z],
        material: material.pbr({ color: style.body, roughness: 0.75 }),
        castShadow: true,
        receiveShadow: true
      });
      const top = primitives.box({
        name: nodeName.platformTop(p.id),
        size: [p.w * 0.98, 0.12, p.d * 0.98],
        position: [p.x, p.y - 0.05, p.z],
        material: material.pbr({ color: style.top, roughness: 0.75 }),
        receiveShadow: true
      });
      if (p.mover || p.timed) {
        const spec2 = game.runtimeNode(nodeName.platform(p.id), { tags: ["platform"] });
        plat.runtime(spec2);
        top.runtime(game.runtimeNode(nodeName.platformTop(p.id), { tags: ["platform"] }));
      }
      builder.add(plat).add(top);
    }
    if (!p.ghost) {
      const s = solidOf(p);
      solids.push(s);
      if (p.mover) moving.push(s);
      if (p.timed) timed.push(s);
    }
  }

  // WP-06 (diorama): procedural multi-material woodland assemblies replace all 26 static clay
  // & borrowed sci-fi/FPS props; `?look=original` keeps its original model nodes unchanged.
  const staticDecorPlacements: StaticDecorPlacement[] = [];

  // Hazards — hurt volumes + sculpted thorny bramble / frost crystal / basalt ember vents.
  const hazards: HazardBox[] = spec.hazards.map((hz) => {
    const h = hz.h ?? 0.5;
    builder.add(
      primitives.box({
        name: `hazard:${hz.id}`,
        size: [hz.w, Math.min(h, 0.24), hz.d],
        position: [hz.x, hz.y - Math.min(h, 0.24) / 2, hz.z],
        material: diorama
          ? hazardMaterial(hz.type, scale.motion)
          : material.emissive({ color: HAZARD_STYLE[hz.type], emissive: HAZARD_STYLE[hz.type], emissiveIntensity: 0.85, roughness: 0.5 })
      })
    );
    builder.add(buildHazardFeatureNode(`hazard:${hz.id}:mesh`, [hz.x, hz.y - Math.min(h, 0.24), hz.z], hz.w, hz.d, hz.type));
    return { spec: hz, x: hz.x, y: hz.y - h / 2, z: hz.z, hx: hz.w / 2, hy: h / 2, hz: hz.d / 2 };
  });

  // Water pockets — glass volumes the swimmer sinks into.
  const waters: WaterZone[] = spec.waters.map((w) => {
    const depth = w.depth ?? 2.2;
    builder.add(
      primitives.box({
        name: nodeName.water(w.id),
        size: [w.w, depth, w.d],
        position: [w.x, w.y - depth / 2, w.z],
        material: material.glass({ color: "#5fbfe8", opacity: 0.38 }),
        castShadow: false,
        receiveShadow: false
      }).runtime(game.runtimeNode(nodeName.water(w.id), { tags: ["water"] }))
    );
    return { spec: w, x: w.x, z: w.z, hx: w.w / 2, hz: w.d / 2, surfaceY: w.y, floorY: w.y - depth };
  });

  // Pickups — ribbed golden sunseeds, oak-cupule golden acorns, and glossy crimson heart-berries.
  const spinNodes: string[] = [];
  for (const s of spec.seeds) {
    const rt = game.runtimeNode(nodeName.seed(s.id), { tags: ["pickup", "seed"] });
    builder.add(buildIdolSunseedNode(nodeName.seed(s.id), [s.x, s.y + 0.16, s.z], rt));
    spinNodes.push(nodeName.seed(s.id));
  }
  for (const a of spec.acorns) {
    const rt = game.runtimeNode(nodeName.acorn(a.id), { tags: ["pickup", "acorn"] });
    builder.add(buildIdolGoldenAcornNode(nodeName.acorn(a.id), [a.x, a.y + 0.12, a.z], rt));
    spinNodes.push(nodeName.acorn(a.id));
  }
  for (const hpt of spec.hearts) {
    const rt = game.runtimeNode(nodeName.heart(hpt.id), { tags: ["pickup", "heart"] });
    builder.add(buildIdolHeartBerryNode(nodeName.heart(hpt.id), [hpt.x, hpt.y + 0.1, hpt.z], rt));
    spinNodes.push(nodeName.heart(hpt.id));
  }

  // Springs — coiled copper-and-toadstool procedural bounce springs in both diorama and original looks (zero GLBs).
  for (const spr of spec.springs) {
    const base = [spr.x, spr.y, spr.z] as const;
    const rt = game.runtimeNode(nodeName.spring(spr.id), { tags: ["spring"] });
    builder.add(buildIdolSpringBaseNode(`${nodeName.spring(spr.id)}:base`, base));
    builder.add(buildBounceSpringCapNode(nodeName.spring(spr.id), base, rt));
  }

  // Checkpoints — carved timber post + stone pad + fluttering swallowtail pennant (zero GLBs).
  const checkpointObstacles: CameraObstacle[] = [];
  for (const cp of spec.checkpoints) {
    // GPU QA: the Idol checkpoint post (2 m, crossbar 0.84 m) used to fill the lens when the boom swung behind it.
    checkpointObstacles.push({ x: cp.x, z: cp.z, baseY: cp.y, radius: 0.45, height: 2.0 });
    const rt = game.runtimeNode(nodeName.checkpointFlag(cp.id), { tags: ["checkpoint"] });
    builder.add(buildIdolCheckpointStandNode(`${nodeName.checkpoint(cp.id)}:pad`, [cp.x, cp.y, cp.z], cp.yaw ?? 0));
    builder.add(buildCheckpointPennantNode(nodeName.checkpointFlag(cp.id), [cp.x, cp.y, cp.z], cp.yaw ?? 0, rt, !diorama));
  }

  // Sun-Gate — rune-carved arch + sculpted solar rune ring + bevelled star lock.
  const g = spec.gate;
  const gateRt = game.runtimeNode(nodeName.gate, { tags: ["gate"] });
  const ringRt = game.runtimeNode(nodeName.gateRing, { tags: ["gate"] });
  const lockRt = game.runtimeNode(nodeName.gateLock, { tags: ["gate"] });
  builder.add(buildIdolSunGateArchNode(nodeName.gate, [g.x, g.y, g.z], 0, gateRt));
  if (diorama) {
    builder.add(buildSunGateRuneRingNode(nodeName.gateRing, [g.x, g.y + 1.5, g.z], GATE_RING_MATERIAL, ringRt));
  } else {
    builder.add(
      primitives.torus({ name: nodeName.gateRing, size: [1.9, 1.9, 0.4], position: [g.x, g.y + 1.5, g.z], material: material.emissive({ color: "#ffcf3d", emissive: "#ffc52e", emissiveIntensity: 0.9 }), castShadow: false })
        .runtime(ringRt)
    );
  }
  builder.add(buildGateLockStarNode(nodeName.gateLock, [g.x, g.y + 1.5, g.z], lockRt));

  // Pass-through pass: solid decor and the Sun-Gate jambs are bodies Pip stops against (platform solids only feed
  // the placement, so grounding below is unchanged).
  const decorSolids = decorColliders(spec, solids);

  // Decor + NPCs.
  const cameraObstacles: CameraObstacle[] = [...checkpointObstacles];
  for (const d of spec.decor) {
    for (const obstacle of cameraObstaclesFor(d)) cameraObstacles.push(obstacle);
    if (diorama && ANIMATED_DECOR_KINDS.has(d.kind)) {
      builder.add(animatedDecorNode(d));
      animatedDecor.push({ name: `${d.id}:${d.kind}`, kind: d.kind as AnimatedDecor["kind"], yaw: d.yaw ?? 0, phase: phaseOf(d.id) });
    } else if (diorama) {
      staticDecorPlacements.push({ kind: d.kind as StaticDecorKind, x: d.x, y: d.y, z: d.z, yaw: d.yaw, s: d.s });
    } else {
      for (const node of decorNodes(d)) builder.add(node);
    }
  }
  if (diorama) {
    // Idol wow pass: every static decor kind with an Idol model is one model node per placement; the rest stay merged.
    const idolKinds = idolDecorKinds();
    const proceduralDecor: StaticDecorPlacement[] = [];
    staticDecorPlacements.forEach((d0, i) => {
      const d = groundIdolDecor(d0, solids, spec.gate);
      const idol = idolKinds.has(d.kind) ? buildIdolDecorNodes(`pbl-decor:${d.kind}:${i}`, d) : null;
      if (!idol) {
        proceduralDecor.push(d);
        return;
      }
      for (const node of idol.nodes) builder.add(node);
      // Moving parts (MOVING-PARTS pass): windmill sails spin, hawks circle, clouds drift — driven by presentation.ts.
      if (idol.moving) {
        animatedDecor.push({ name: idol.moving.name, kind: idol.moving.kind, yaw: idol.moving.yaw, phase: phaseOf(idol.moving.name), base: idol.moving.base, scale: idol.moving.scale });
      }
    });
    for (const node of buildDioramaStaticDecorNodes(proceduralDecor)) builder.add(node);
  }
  solids.push(...decorSolids);
  for (const n of spec.npcs) {
    cameraObstacles.push({ x: n.x, z: n.z, baseY: n.y, radius: 0.32, height: 1.15 });
    const npcName = diorama ? `pbl-villager:${n.id}` : nodeName.npc(n.id);
    builder.add(buildIdolVillagerNode(npcName, [n.x, n.y, n.z], -0.45, n.who));
    // Creature motion pass: the rigged villager idles at its post and paces a short loop (presentation.ts).
    if (diorama) animatedDecor.push({ name: npcName, kind: "villager", yaw: -0.45, phase: phaseOf(npcName), base: [n.x, n.y, n.z], scale: 1 });
  }

  // Hero — rigged Idol felt-and-clay Pip (idol wow pass); camera rigs onto it, main.ts drives clips + body lean.
  const heroSpawnYaw = spec.spawnYaw ?? Math.PI;
  builder.add(
    buildIdolPipHeroNode(
      nodeName.hero,
      [spec.spawn[0], spec.spawn[1], spec.spawn[2]],
      heroSpawnYaw,
      game.runtimeNode(nodeName.hero, { tags: QA_POSE_EVIDENCE ? ["player", "aura:evidence-deformed-bounds"] : ["player"] })
    )
  );
  // Player Studio cape: hidden by default (`visible: false`); if enabled in Studio, drapes cleanly behind Pip's back (-Z).
  const capeBase = geometry
    .custom(geometry.define(heroCapeGeometry()), {
      name: nodeName.heroCape,
      material: diorama ? heroCapeMaterial("#3f8cff", scale.motion) : material.pbr({ color: "#3f8cff", roughness: 0.6 }),
      castShadow: false,
      receiveShadow: false
    })
    .position(spec.spawn[0], spec.spawn[1] + 0.66, spec.spawn[2] + 0.11)
    .rotate(0, spec.spawnYaw ?? Math.PI, 0)
    .runtime(game.runtimeNode(nodeName.heroCape, { tags: ["player", "studio"] }));
  const capeHidden = new (capeBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof capeBase)({
    ...capeBase.toJSON(),
    visible: false
  });
  builder.add(capeHidden);

  // Airborne landing aid (diorama only): feathered altitude-scaled shadow disc + concentric gold landing ring
  // projected directly onto the walkable slab below Pip whenever he leaps over a gap.
  if (diorama) {
    const dropShadowBase = primitives
      .cylinder({
        name: nodeName.dropShadow,
        size: [0.68, 0.014, 0.68],
        position: [spec.spawn[0], spec.spawn[1] + 0.015, spec.spawn[2]],
        material: material.pbr({
          color: "#1a130b",
          roughness: 1,
          metallic: 0,
          alphaMode: "blend",
          opacity: 0.28,
          depthWrite: false
        }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime(game.runtimeNode(nodeName.dropShadow, { tags: ["player", "vfx"] }));
    builder.add(
      new (dropShadowBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof dropShadowBase)({
        ...dropShadowBase.toJSON(),
        visible: false
      })
    );
    const landingRingBase = primitives
      .torus({
        name: nodeName.landingRing,
        size: [0.74, 0.74, 0.055],
        position: [spec.spawn[0], spec.spawn[1] + 0.024, spec.spawn[2]],
        rotation: [Math.PI / 2, 0, 0],
        material: material.emissive({
          color: "#ffcf4d",
          emissive: "#ffc23d",
          emissiveIntensity: 1.15,
          practical: true,
          alphaMode: "blend",
          opacity: 0.72,
          depthWrite: false
        }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime(game.runtimeNode(nodeName.landingRing, { tags: ["player", "vfx"] }));
    builder.add(
      new (landingRingBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof landingRingBase)({
        ...landingRingBase.toJSON(),
        visible: false
      })
    );
  }

  // Boss (W5) — articulated @aura3d/engine procedural Brambleback rig + 6 orbiting thorny crystal spikes.
  if (spec.boss) {
    builder.add(
      buildIdolBramblebackNode(
        nodeName.boss,
        [0, 2.6, -69],
        game.runtimeNode(nodeName.boss, { tags: ["boss"] })
      )
    );
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const spikeRt = game.runtimeNode(nodeName.bossSpike(i), { tags: ["boss"] });
      builder.add(buildBossThornSpikeNode(nodeName.bossSpike(i), [Math.cos(a) * 1.05, 4.4, -69 + Math.sin(a) * 1.05], spikeRt));
    }
  }

  // PBL-W1: seeded felt-and-clay flora tufts on the static platform rims (diorama only).
  let floraCount = 0;
  if (diorama) {
    const layers = floraLayers(spec, look, 9100 + spec.order * 31);
    for (const node of floraNodes(layers, scale.motion)) builder.add(node);
    floraCount = layers.reduce((sum, layer) => sum + layer.transforms.length, 0);
  }

  builder.camera(
    camera.perspective({
      ...labCameraOptions(readLabFlags(), "reversed"),
      ...(diorama
        ? {
            // PBL-C2 miniature framing (lens 1.7 m above Pip's feet, fov 46).
            position: [spec.spawn[0], spec.spawn[1] + MINIATURE_LIFT, spec.spawn[2] + 4.5] as [number, number, number],
            target: [spec.spawn[0], spec.spawn[1] + 0.55, spec.spawn[2] - 3.2] as [number, number, number],
            fov: 46
          }
        : {
            position: [spec.spawn[0], spec.spawn[1] + 1.95, spec.spawn[2] + 4.2] as [number, number, number],
            target: [spec.spawn[0], spec.spawn[1] + 0.95, spec.spawn[2] - 2.4] as [number, number, number],
            fov: 52
          })
    })
  );

  return {
    spec, motion, scene: builder, solids, hazards, waters,
    seeds: spec.seeds, acorns: spec.acorns, hearts: spec.hearts,
    springs: spec.springs, checkpoints: spec.checkpoints,
    spinNodes, movingSolids: moving, timedSolids: timed,
    cameraObstacles,
    bossArenaZ: spec.boss ? -69 : null,
    presentation: {
      mode,
      look,
      baseTop,
      practicals: diorama ? look.practicals.map((p) => ({ name: p.name, intensity: p.intensity, flicker: p.flicker })) : [],
      floraCount,
      instancedPlatforms,
      animatedDecor,
      bobNodes
    }
  };
}

/** Advance moving/timed platform solids + mirror into runtime node handles. */
export function tickPlatforms(
  built: BuiltWorld,
  t: number,
  node: (name: string) => { setPosition(x: number, y: number, z: number): unknown; setVisible(v: boolean): unknown } | null
): void {
  for (const s of built.movingSolids) {
    const m = s.plat.mover;
    if (!m) continue;
    const h = s.plat.h ?? PLAT_H;
    const phase = (t / m.period) * Math.PI * 2 + (m.phase ?? 0);
    const off = Math.sin(phase) * m.amplitude;
    const vel = Math.cos(phase) * m.amplitude * (Math.PI * 2 / m.period);
    s.vx = 0; s.vy = 0; s.vz = 0;
    s.x = s.plat.x; s.z = s.plat.z; s.y = s.plat.y - h / 2;
    if (m.axis === "x") { s.x += off; s.vx = vel; }
    else if (m.axis === "z") { s.z += off; s.vz = vel; }
    else { s.y += off; s.vy = vel; }
    node(nodeName.platform(s.id))?.setPosition(s.x, s.y, s.z);
    node(nodeName.platformTop(s.id))?.setPosition(s.x, s.y + h / 2 - 0.05, s.z);
  }
  for (const s of built.timedSolids) {
    const tm = s.plat.timed;
    if (!tm) continue;
    const f = ((((t + (tm.phase ?? 0)) % tm.period) + tm.period) % tm.period) / tm.period;
    s.active = f < tm.onFrac;
    node(nodeName.platform(s.id))?.setVisible(s.active);
    node(nodeName.platformTop(s.id))?.setVisible(s.active);
  }
}
