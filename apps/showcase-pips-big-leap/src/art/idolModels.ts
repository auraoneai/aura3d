/**
 * Idol wow pass (2026-11) — Pip's Big Leap image-to-3D models.
 *
 * High-detail needle-felt-and-clay GLBs generated with `speridlabs/idol/max` (tools/idol/specs/pips-big-leap.json)
 * replace the code-built hero, boss, villagers, pickups, Sun-Gate arch, checkpoint posts, spring drums and the
 * static diorama decor. Render layer only: every builder keeps the node name, runtime id, pivot and footprint of
 * the procedural builder it replaces, so collision, camera rigs and the simulation are untouched.
 * Idol GLBs are grounded at y = 0, centred in XZ, face +Z and are already scaled to metres (`scaleMode: "world"`).
 */
import {
  AuraNodeBuilder,
  group,
  model,
  type AuraModelMaterialOverride,
  type AuraSceneNode
} from "@aura3d/engine";
import { sharedAssets } from "../aura-assets.shared.js";
import {
  buildGoldenAcornNode,
  buildHeartBerryNode,
  buildSunseedNode,
  type StaticDecorKind,
  type StaticDecorPlacement
} from "./proceduralModels.js";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
type AuraModelNode = Extract<AuraSceneNode, { readonly kind: "model" }>;
type RuntimeSpec = Parameters<AuraNodeBuilder<AuraGroupNode>["runtime"]>[0];
type Vec3 = readonly [number, number, number];
type PipIdolAsset = Parameters<typeof model>[0];

/**
 * The admitted Idol asset for `key`, or undefined while it is not in the shared catalog yet (an optional set piece
 * then keeps its procedural builder). The hero, boss, villagers and course pieces are always present.
 */
export function idolAsset(key: string): PipIdolAsset | undefined {
  return (sharedAssets as unknown as Readonly<Record<string, PipIdolAsset | undefined>>)[key];
}
function requiredIdol(key: string): PipIdolAsset {
  const a = idolAsset(key);
  if (!a) throw new Error(`Pip's Big Leap: Idol asset "${key}" is missing from src/aura-assets.shared.ts (run scripts/sync-shared-assets.mjs)`);
  return a;
}

/** Soft warm rim so the felt hero separates from the felt world (same family as the old plush overrides). */
const HERO_FELT_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { sheen: 0.45, sheenColor: "#ffe4be", sheenRoughness: 0.5, rim: { color: "#fff0c8", power: 2.6, intensity: 0.34 } }
];
const BOSS_FELT_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { sheen: 0.32, sheenColor: "#d99b72", sheenRoughness: 0.58, rim: { color: "#ffb878", power: 2.4, intensity: 0.4 } }
];
/** Collectibles read as treasure against the felt meadow: a bright rim plus a faint warm glow (<= 0.1, the art audit's emissive-as-fill limit). */
const SEED_GLOW: readonly AuraModelMaterialOverride[] = [{ emissive: "#ffc23d", emissiveIntensity: 0.1, rim: { color: "#fff1b0", power: 2.2, intensity: 0.5 } }];
const ACORN_GLOW: readonly AuraModelMaterialOverride[] = [{ emissive: "#e8a02a", emissiveIntensity: 0.1, rim: { color: "#ffe6a0", power: 2.3, intensity: 0.45 } }];
const HEART_GLOW: readonly AuraModelMaterialOverride[] = [{ emissive: "#e0303a", emissiveIntensity: 0.1, rim: { color: "#ffc0c0", power: 2.3, intensity: 0.42 } }];

/** Idol clip names baked by the generator (in-place loops). */
export const PIP_IDOL_CLIPS = { idle: "idle", walk: "walk", run: "run", jump: "jump" } as const;

/**
 * Rigged Idol GLBs keep their skeleton at source scale (a scaled wrapper inflates skin checks); the metre scale from
 * `assets/idol/<key>.idol.json` -> normalized.sceneScale is applied on the scene node instead. Every runtime setScale on
 * these nodes (presentation squash, boss squash) multiplies by it.
 */
export const PIP_HERO_SCENE_SCALE = 1.25;
export const BOSS_SCENE_SCALE = 2.46;

/** Torso pivot height of the old articulated rig; lean/roll on the Idol hero pivot here so the feet stay put. */
export const PIP_IDOL_PIVOT_Y = 0.49;
/** Body-centre height of the old Brambleback rig (lean pivot for the Idol boss). */
export const BOSS_IDOL_PIVOT_Y = 1.08;

function idolModel(
  asset: PipIdolAsset,
  name: string,
  opts: {
    readonly position?: Vec3;
    readonly yaw?: number;
    readonly scale?: number;
    readonly scaleXYZ?: readonly [number, number, number];
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly materialOverrides?: readonly AuraModelMaterialOverride[];
  } = {}
): AuraNodeBuilder<AuraModelNode> {
  const p = opts.position ?? [0, 0, 0];
  return model(asset, {
    name,
    scaleMode: "world",
    castShadow: opts.castShadow ?? true,
    receiveShadow: opts.receiveShadow ?? true,
    ...(opts.materialOverrides ? { materialOverrides: opts.materialOverrides } : {}),
    position: [p[0], p[1], p[2]],
    rotation: [0, opts.yaw ?? 0, 0],
    ...(opts.scaleXYZ ? { scale: [opts.scaleXYZ[0], opts.scaleXYZ[1], opts.scaleXYZ[2]] as [number, number, number] } : opts.scale !== undefined && opts.scale !== 1 ? { scale: opts.scale } : {})
  });
}

/** Rigged Idol Pip (1.25 m after PIP_HERO_SCENE_SCALE), the runtime `pip` node itself: the camera, trails and squash ride on it. */
export function buildIdolPipHeroNode(name: string, pos: Vec3, yaw: number, rt: RuntimeSpec): AuraNodeBuilder<AuraModelNode> {
  return idolModel(requiredIdol("pipHero"), name, { position: pos, yaw, scale: PIP_HERO_SCENE_SCALE, materialOverrides: HERO_FELT_OVERRIDES })
    .animate({ clip: PIP_IDOL_CLIPS.idle, loop: true, speed: 1 })
    .runtime(rt) as AuraNodeBuilder<AuraModelNode>;
}

/** Rigged Idol Brambleback (2.25 m after BOSS_SCENE_SCALE), the runtime `brambleback` node itself (feet at the node origin). */
export function buildIdolBramblebackNode(name: string, pos: Vec3, rt: RuntimeSpec): AuraNodeBuilder<AuraModelNode> {
  return idolModel(requiredIdol("pipBrambleback"), name, { position: pos, scale: BOSS_SCENE_SCALE, materialOverrides: BOSS_FELT_OVERRIDES })
    .animate({ clip: PIP_IDOL_CLIPS.idle, loop: true, speed: 1 })
    .runtime(rt) as AuraNodeBuilder<AuraModelNode>;
}

/**
 * Rigged Idol villagers (creature rigs with idle + walk loops) at their `normalized.sceneScale` from the .idol.json.
 * presentation.ts paces them: idle breathing at the post, then a short walk out and back with the walk clip playing.
 */
export const VILLAGER_SCENE_SCALE = { helper: 0.966, sidekick: 1.251 } as const;
export const VILLAGER_CLIPS = { idle: "idle", walk: "walk" } as const;
const VILLAGER_ASSET = { helper: "pipHedgehogRigged", sidekick: "pipBeetleRigged" } as const;

/** Idol villager standing in for an NPC runner (hedgehog helper / forest-beetle sidekick); a runtime node so it can pace. */
export function buildIdolVillagerNode(name: string, pos: Vec3, yaw: number, who: "helper" | "sidekick"): AuraNodeBuilder<AuraModelNode> {
  return idolModel(requiredIdol(VILLAGER_ASSET[who]), name, { position: pos, yaw, scale: VILLAGER_SCENE_SCALE[who] })
    .animate({ clip: VILLAGER_CLIPS.idle, loop: true, speed: 1 })
    .runtime({ id: name, tags: ["npc", "villager"] }) as AuraNodeBuilder<AuraModelNode>;
}

/**
 * Hawk = wingless body + two wing pivots (pipHawkBody / pipHawkWing). The wing GLB stands in its XY plane with the
 * shoulder at -X (x -0.30), leading edge +Y; it is laid flat (Rx +90: leading edge forward) with its shoulder on the
 * pivot, and the left wing is the same model turned 180 deg about Z. presentation.ts flaps the pivots about Z and banks
 * the `:bank` group into the turn while the outer node circles.
 */
export const HAWK_WING = { shoulderX: 0.3, chordY: 0.14, pivot: [0.07, 0.05, 0.02] as const } as const;
export function hawkPartNames(name: string): { readonly bank: string; readonly wingL: string; readonly wingR: string } {
  return { bank: `${name}:bank`, wingL: `${name}:wing-l`, wingR: `${name}:wing-r` };
}
function buildIdolHawkNodes(name: string, position: Vec3, yaw: number, s: number): AuraNodeBuilder<AuraSceneNode> | null {
  const body = idolAsset("pipHawkBody");
  const wing = idolAsset("pipHawkWing");
  if (!body || !wing) return null;
  const parts = hawkPartNames(name);
  const [px, py, pz] = HAWK_WING.pivot;
  const flatWing = (id: string) =>
    group(`${id}:flat`, [idolModel(wing, `${id}:idol`, { position: [HAWK_WING.shoulderX, -HAWK_WING.chordY, 0], castShadow: false })]).rotate(Math.PI / 2, 0, 0);
  const wingR = group(parts.wingR, [flatWing(parts.wingR)]).position(px, py, pz).runtime({ id: parts.wingR, tags: ["decor", "moving"] });
  const wingL = group(parts.wingL, [group(`${parts.wingL}:mirror`, [flatWing(parts.wingL)]).rotate(0, 0, Math.PI)])
    .position(-px, py, pz)
    .runtime({ id: parts.wingL, tags: ["decor", "moving"] });
  const bank = group(parts.bank, [idolModel(body, `${name}:body`, { position: [0, -0.15, 0], castShadow: false }), wingL, wingR]).runtime({ id: parts.bank, tags: ["decor", "moving"] });
  return group(name, [bank]).position(position[0], position[1], position[2]).rotate(0, yaw, 0).scale(s)
    .runtime({ id: name, tags: ["decor", "moving"] }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/**
 * Spinning pickup: a group carrying the runtime id (main.ts spins it about Y), with the grounded Idol model dropped by
 * `drop` so the pickup's visual centre sits where the procedural one did.
 */
function pickupNode(asset: PipIdolAsset, name: string, pos: Vec3, drop: number, rt: RuntimeSpec, glow: readonly AuraModelMaterialOverride[]): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [
    idolModel(asset, `${name}:idol`, { position: [0, -drop, 0], castShadow: false, receiveShadow: false, materialOverrides: glow })
  ])
    .position(pos[0], pos[1], pos[2])
    .runtime(rt);
}
export function buildIdolSunseedNode(name: string, pos: Vec3, rt: RuntimeSpec): AuraNodeBuilder<AuraGroupNode> {
  const a = idolAsset("pipSunseed");
  return a ? pickupNode(a, name, pos, 0.24, rt, SEED_GLOW) : buildSunseedNode(name, pos, rt);
}
export function buildIdolGoldenAcornNode(name: string, pos: Vec3, rt: RuntimeSpec): AuraNodeBuilder<AuraGroupNode> {
  const a = idolAsset("pipGoldenAcorn");
  return a ? pickupNode(a, name, pos, 0.26, rt, ACORN_GLOW) : buildGoldenAcornNode(name, pos, rt);
}
export function buildIdolHeartBerryNode(name: string, pos: Vec3, rt: RuntimeSpec): AuraNodeBuilder<AuraGroupNode> {
  const a = idolAsset("pipHeartBerry");
  return a ? pickupNode(a, name, pos, 0.2, rt, HEART_GLOW) : buildHeartBerryNode(name, pos, rt);
}

/** Sun-Gate stone arch (the procedural rune ring and star lock still sit in its 2.84 m opening). */
export function buildIdolSunGateArchNode(name: string, pos: Vec3, yaw: number, rt: RuntimeSpec): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [idolModel(requiredIdol("pipSunGate"), `${name}:idol`, { position: [0, 0, -0.17] })])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, yaw, 0)
    .runtime(rt);
}

/** Checkpoint post; the procedural pennant still hangs from the crossbar (x = +0.37 local). */
export function buildIdolCheckpointStandNode(name: string, pos: Vec3, yaw: number): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [idolModel(requiredIdol("pipCheckpointStand"), `${name}:idol`, { position: [CHECKPOINT_POST_OFFSET_X, 0, 0] })])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, yaw, 0);
}
/** Bounds-centring shifts the post 0.244 m off the arm side (measured on pipCheckpointStand.glb); this re-centres it on the pad. */
export const CHECKPOINT_POST_OFFSET_X = 0.244;

/** Spring drum under the procedural bouncing toadstool cap. */
export function buildIdolSpringBaseNode(name: string, pos: Vec3): AuraNodeBuilder<AuraGroupNode> {
  // The felt drum came out 0.60 m tall at the procedural base's 1.08 m width; squash it to the old 0.425 m so the
  // bouncing cap (min y 0.31) still sits on top.
  return group(name, [idolModel(requiredIdol("pipSpringBase"), `${name}:idol`, { scaleXYZ: [1, 0.71, 1] })]).position(pos[0], pos[1], pos[2]);
}

interface DecorIdol {
  readonly key: string;
  /** Extra vertical offset (crystals sink into the ground like the procedural cluster did). */
  readonly dy?: number;
  readonly castShadow: boolean;
}

const DECOR_IDOL: Readonly<Partial<Record<StaticDecorKind, DecorIdol>>> = {
  tree: { key: "pipOakTree", castShadow: true },
  conifer: { key: "pipConifer", castShadow: true },
  mushroom: { key: "pipToadstool", castShadow: true },
  flower: { key: "pipFlower", castShadow: false },
  rock: { key: "pipBoulder", dy: -0.1, castShadow: true },
  pillar: { key: "pipStonePillar", castShadow: true },
  arch: { key: "pipStoneArch", castShadow: true },
  cloud: { key: "pipCloud", dy: -0.22, castShadow: false },
  windmill: { key: "pipWindmillTower", castShadow: true },
  sail: { key: "pipWatchtower", castShadow: true },
  crate: { key: "pipCrate", castShadow: true },
  barrel: { key: "pipBarrel", castShadow: true },
  lantern: { key: "pipLantern", castShadow: true },
  crystal: { key: "pipCrystal", dy: -0.12, castShadow: true },
  vent: { key: "pipEmberVent", castShadow: true },
  star: { key: "pipStarRelic", castShadow: false },
  hawk: { key: "pipHawkBody", dy: 0.43, castShadow: false }
};

/** Decor kinds drawn with an Idol model instead of the merged procedural buckets. */
export function idolDecorKinds(): ReadonlySet<StaticDecorKind> {
  return new Set((Object.keys(DECOR_IDOL) as StaticDecorKind[]).filter((k) => idolAsset(DECOR_IDOL[k]!.key) !== undefined));
}

/** A decor prop the presentation moves (windmill sails spin, hawks circle, clouds drift); see world.ts AnimatedDecor. */
export interface IdolMovingDecor {
  readonly name: string;
  readonly kind: "sails" | "hawk" | "cloud";
  readonly yaw: number;
  /** Rest position of the moving node (world space). */
  readonly base: readonly [number, number, number];
  readonly scale: number;
}

/**
 * Windmill axle on pipWindmillTower.glb (measured: the hub tip at x 0.075, y 2.93, z 1.536); the separate
 * pipWindmillSails cross spins about the tower's local +Z just in front of it.
 */
export const WINDMILL_HUB: readonly [number, number, number] = [0.075, 2.93, 1.62];
/** pipWindmillSails.glb lies flat (thin along Y, hub cap on +Y, 0.598 m thick): lift it upright facing +Z about its hub. */
const SAILS_HUB_DROP = 0.3;

/**
 * Idol model node(s) for one static decor placement; the shared asset handle is loaded once per world. Windmills are a
 * sail-less tower plus a spinning sail cross; hawks and clouds get a runtime id so the presentation can move them.
 */
export function buildIdolDecorNodes(
  name: string,
  d: StaticDecorPlacement
): { readonly nodes: readonly AuraNodeBuilder<AuraSceneNode>[]; readonly moving?: IdolMovingDecor } | null {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;
  if (d.kind === "windmill") {
    const tower = idolAsset("pipWindmillTower");
    const sails = idolAsset("pipWindmillSails");
    if (tower && sails) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const [hx, hy, hz] = WINDMILL_HUB;
      const base: [number, number, number] = [d.x + (hx * cy + hz * sy) * s, d.y + hy * s, d.z + (-hx * sy + hz * cy) * s];
      const spinName = `${name}:sails`;
      const sailCross = group(spinName, [
        group(`${spinName}:upright`, [idolModel(sails, `${spinName}:idol`, { position: [0, -SAILS_HUB_DROP, 0], castShadow: true })]).rotate(Math.PI / 2, 0, 0)
      ]).runtime({ id: spinName, tags: ["decor", "moving"] });
      const hub = group(`${name}:hub`, [sailCross]).position(base[0], base[1], base[2]).rotate(0, yaw, 0).scale(s);
      return {
        nodes: [
          idolModel(tower, name, { position: [d.x, d.y, d.z], yaw, scale: s, castShadow: true }) as unknown as AuraNodeBuilder<AuraSceneNode>,
          hub as unknown as AuraNodeBuilder<AuraSceneNode>
        ],
        moving: { name: spinName, kind: "sails", yaw, base, scale: s }
      };
    }
  }
  const entry = DECOR_IDOL[d.kind];
  const asset = entry ? idolAsset(entry.key) : undefined;
  if (!entry || !asset) return null;
  const lift = d.kind === "star" ? 0.55 * s : 0;
  const position: [number, number, number] = [d.x, d.y + (entry.dy ?? 0) * s + lift, d.z];
  const node = idolModel(asset, name, { position, yaw, scale: s, castShadow: entry.castShadow, receiveShadow: true });
  if (d.kind === "hawk") {
    // The old hawk's body spanned y 0.43..0.92 above the placement; centre the split hawk (body origin mid-body) at 0.67.
    // GPU QA: the hawk flew through the follow camera's near zone. Circle 2.6 m further out from the course centre line
    // and 1.6 m higher than the old perch, so the loop (radius 1 m) stays clear of the boom over the path.
    const out = d.x < 0 ? -1 : 1;
    const centre: [number, number, number] = [d.x + out * 2.6, d.y + (0.67 + 1.6) * s, d.z];
    const hawk = buildIdolHawkNodes(name, centre, yaw, s);
    if (hawk) return { nodes: [hawk], moving: { name, kind: "hawk", yaw, base: centre, scale: s } };
  }
  if (d.kind === "hawk" || d.kind === "cloud") {
    return {
      nodes: [node.runtime({ id: name, tags: ["decor", "moving"] }) as unknown as AuraNodeBuilder<AuraSceneNode>],
      moving: { name, kind: d.kind, yaw, base: position, scale: s }
    };
  }
  return { nodes: [node as unknown as AuraNodeBuilder<AuraSceneNode>] };
}
