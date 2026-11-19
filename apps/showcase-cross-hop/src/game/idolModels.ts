/**
 * Idol wow pass (2026-11): image-to-3D toy-diorama models (`speridlabs/idol/max`, tools/idol/specs/cross-hop.json)
 * replace the most-seen procedural meshes: the 12 critters, the traffic fleet, river rafts/logs/lily pads, lava
 * stones, verge trees and bushes and the hawk. The rescue pod stays procedural: its clear glass dome bakes opaque in Idol. Render layer only: every mover keeps its lane,
 * speed, hit footprint and pool slot; only the drawn mesh changes.
 *
 * Each GLB is metric (scaleMode "world"), grounded at y = 0, centred on X/Z and faces +Z. The lane movers travel
 * along X, so their pool rotations add `IDOL_ALONG_X` (+90 deg yaw turns +Z into +X).
 *
 * Moving parts (MOVING-PARTS pass): the road and rail vehicle bodies are generated WITHOUT wheels; separate Idol wheels
 * (`hopWheel`, `hopRailWheel`, two instanced pools) sit at the measured arch hubs (src/game/idolWheels.json, written by
 * scripts/measure-idol-wheels.mjs) and spin by distance travelled / wheel radius (`vehicleWheelPoses`).
 */
import { game, group, instances, model, type AuraTransformSpec } from "@aura3d/engine";
import type { CritterAssetId } from "../aura-assets";
import { idolAssets } from "../aura-assets.idol";
import { composeCharacterEulerXYZ } from "./diorama";
import wheelLayouts from "./idolWheels.json";

type IdolKey = keyof typeof idolAssets;
type IdolAsset = (typeof idolAssets)[IdolKey];

export const IDOL_CRITTERS: Readonly<Record<CritterAssetId, IdolAsset>> = {
  hop: idolAssets.hopCritterHop,
  chick: idolAssets.hopCritterChick,
  turtle: idolAssets.hopCritterTurtle,
  bun: idolAssets.hopCritterBun,
  axolotl: idolAssets.hopCritterAxolotl,
  ducky: idolAssets.hopCritterDucky,
  roboFrog: idolAssets.hopCritterRoboFrog,
  toastCat: idolAssets.hopCritterToastCat,
  mushroomKid: idolAssets.hopCritterMushroomKid,
  knightToad: idolAssets.hopCritterKnightToad,
  astroFrog: idolAssets.hopCritterAstroFrog,
  goldenHop: idolAssets.hopCritterGoldenHop
};

/** Pool key -> Idol model for the instanced pools the Idol pass draws (pool keys as in core.ts `CAP`). */
export const IDOL_POOL_ASSET = {
  car: idolAssets.hopCarSedan,
  hatch: idolAssets.hopCarHatch,
  suv: idolAssets.hopCarSuv,
  taxi: idolAssets.hopCarTaxi,
  van: idolAssets.hopCarVan,
  pickup: idolAssets.hopCarPickup,
  truck: idolAssets.hopBoxTruck,
  tram: idolAssets.hopTram,
  train: idolAssets.hopTrainLoco,
  coach: idolAssets.hopTrainCoach,
  hover: idolAssets.hopHoverCar,
  log: idolAssets.hopRiverLog,
  raft: idolAssets.hopLogRaft,
  raftCandy: idolAssets.hopCandyRaft,
  pad: idolAssets.hopLilyPad,
  stone: idolAssets.hopLavaStone,
  tree: idolAssets.hopTree,
  treeB: idolAssets.hopTreeBlossom,
  bush: idolAssets.hopBush,
  wheel: idolAssets.hopWheel,
  railWheel: idolAssets.hopRailWheel
} as const;
export type IdolPoolKey = keyof typeof IDOL_POOL_ASSET;

/** River surfaces (m): water top, the lily-pad top the critter stands on (core.ts PAD_TOP) and the raft/log deck top. */
export const IDOL_WATERLINE = { waterY: 0, padTop: 0.12, raftTop: 0.22 } as const;
/** Terrain props (trees, bushes) sink this far into the ground under them so no base edge floats. */
export const IDOL_GROUND_SINK = 0.12;

/** +90 deg yaw: an Idol GLB's +Z front becomes the lane's +X travel direction. */
export const IDOL_ALONG_X = Math.PI / 2;

/** Drawn height (m) of an Idol model, from its admitted bounds. */
export function idolHeight(asset: IdolAsset): number {
  return asset.bounds[1];
}

/** Drawn length along the GLB's +Z axis (m). */
export function idolLength(asset: IdolAsset): number {
  return asset.bounds[2];
}

/** One instanced Idol pool in place of a procedural `instances.custom` pool; same name and runtime node id. */
export function idolPool(
  key: IdolPoolKey,
  name: string,
  runtimeId: string,
  transforms: readonly AuraTransformSpec[],
  opts: { castShadow?: boolean; receiveShadow?: boolean } = {}
) {
  return instances.model(IDOL_POOL_ASSET[key], {
    name,
    scaleMode: "world",
    transforms,
    castShadow: opts.castShadow ?? true,
    receiveShadow: opts.receiveShadow ?? true
  }).runtime(game.runtimeNode(runtimeId));
}

export interface IdolCritterOptions {
  readonly name: string;
  readonly targetHeight?: number;
  readonly castShadow?: boolean;
}

/**
 * Idol critter with the procedural node's structure: outer `name` group (world yaw, position) holding the
 * `${name}-tilt` runtime group (pitch, bank and the hop squash/stretch scale), which holds the rigid model.
 * Facing +Z, centred on X/Z, feet at y = 0, `targetHeight` tall.
 */
export function buildIdolCritterNode(id: CritterAssetId, opts: IdolCritterOptions) {
  const asset = IDOL_CRITTERS[id];
  const targetHeight = opts.targetHeight ?? 1.05;
  const s = targetHeight / idolHeight(asset);
  const body = model(asset, {
    name: `${opts.name}-body`,
    scaleMode: "world",
    scale: [s, s, s],
    castShadow: opts.castShadow ?? true,
    // Same as the procedural critters: no self-shadow acne from the wide world shadow map on small rounded bodies.
    receiveShadow: false
  }).runtime(game.runtimeNode(`${opts.name}-body`)); // part pose target (critterRig.ts)
  const innerTilt = group(`${opts.name}-tilt`, [body]).runtime(game.runtimeNode(`${opts.name}-tilt`));
  return group(opts.name, [innerTilt]);
}

/** Stooping hawk: the procedural hawk's origin sits mid-body, so the grounded GLB is dropped by half its height. */
export function buildIdolHawkNode() {
  const asset = idolAssets.hopHawk;
  return group("hawk", [
    model(asset, { name: "hawk-body", scaleMode: "world", position: [0, -idolHeight(asset) / 2, 0], castShadow: true, receiveShadow: false })
      .runtime(game.runtimeNode("hawk-body"))
  ]);
}

/**
 * Widest drawn footprint (m) across the lane for each lane mover, in the GLB's local X (the lane-depth axis once the
 * mover is yawed along X). The lanes are 1.15 m deep, so a chunky toy body is narrowed to stay inside its own lane.
 */
const IDOL_MAX_WIDTH: Partial<Record<IdolPoolKey, number>> = {
  car: 1.0, hatch: 1.0, suv: 1.0, taxi: 1.0, van: 1.0, pickup: 1.0, truck: 1.0, tram: 0.95, train: 0.9, coach: 0.9,
  hover: 1.0, raft: 0.95, raftCandy: 0.95
};

/**
 * Instance scale for an Idol pool: lengths stay exactly as generated (the hitbox lengths), only an over-wide body is
 * narrowed across the lane. Lava stones fit their 1.05 m (X) by 0.88 m (Z) stepping footprint. Placement code reads
 * the drawn height as `idolHeight(asset) * idolScale(key)[1]`.
 */
export function idolScale(key: IdolPoolKey): [number, number, number] {
  const [w, , l] = IDOL_POOL_ASSET[key].bounds;
  if (key === "stone") return [Math.min(1, 1.05 / w), 1, Math.min(1, 0.88 / l)];
  // Waterline: the lily pad's top stays at the critter's foot height (PAD_TOP 0.12) and its underside dips 2 cm into
  // the water (top at y = 0); the thin candy raft is thickened so its pontoons sit 4 cm in the water under the 0.22 deck.
  const h = IDOL_POOL_ASSET[key].bounds[1];
  if (key === "pad") return [1, (IDOL_WATERLINE.padTop - IDOL_WATERLINE.waterY + 0.02) / h, 1];
  if (key === "raftCandy") return [Math.min(1, 0.95 / w), Math.max(1, (IDOL_WATERLINE.raftTop - IDOL_WATERLINE.waterY + 0.04) / h), 1];
  // The round river log keeps a round 0.65 m cross-section: X and Y shrink together, the 3.8 m length is kept.
  if (key === "log") { const k = Math.min(1, 0.65 / w); return [k, k, 1]; }
  // Coaches are drawn at the locomotive's roof height so the coupled train reads as one set.
  if (key === "coach") return [Math.min(1, 0.9 / w), Math.min(1, idolHeight(IDOL_POOL_ASSET.train) / IDOL_POOL_ASSET.coach.bounds[1]), 1];
  const maxW = IDOL_MAX_WIDTH[key];
  return [maxW ? Math.min(1, maxW / w) : 1, 1, 1];
}

/** Wheel layout of a wheel-less Idol body (body-local metres, before `idolScale`): see scripts/measure-idol-wheels.mjs. */
export interface IdolWheelLayout {
  readonly rail: boolean;
  /** Largest wheel radius (m). */
  readonly radius: number;
  /** Per-hub wheel radius (m), parallel to `hubs` (arches differ in size on some bodies). */
  readonly radii: readonly number[];
  /** The body is drawn this far above the road so the wheels touch it. */
  readonly lift: number;
  /** Hub centres in the body's local frame (x across, y up from the body's lowest point, z along the body). */
  readonly hubs: readonly (readonly [number, number, number])[];
  /** Measured empty arches `[z0, z1, topY]` (road bodies). */
  readonly arches: readonly (readonly [number, number, number])[];
  readonly body: { readonly halfWidth: number; readonly height: number; readonly length: number };
}

const POOL_BODY_KEY: Partial<Record<IdolPoolKey, keyof typeof wheelLayouts>> = {
  car: "hopCarSedan", hatch: "hopCarHatch", suv: "hopCarSuv", taxi: "hopCarTaxi", van: "hopCarVan", pickup: "hopCarPickup",
  truck: "hopBoxTruck", tram: "hopTram", train: "hopTrainLoco", coach: "hopTrainCoach"
};

/** Wheel layout for a vehicle pool, or undefined (hover car: no wheels; rafts, logs and props). */
export function idolWheelLayout(pool: IdolPoolKey): IdolWheelLayout | undefined {
  const key = POOL_BODY_KEY[pool];
  return key ? (wheelLayouts[key] as unknown as IdolWheelLayout) : undefined;
}

/** Height above the road at which a vehicle body is drawn (its wheels' lift; 0 without wheels). */
export function idolBodyLift(pool: IdolPoolKey): number {
  return idolWheelLayout(pool)?.lift ?? 0;
}

export interface IdolWheelPose {
  readonly pool: "wheel" | "railWheel";
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly scale: number;
}

/**
 * World poses of a vehicle's wheels. `x, roadY, z` and `bodyYaw` are the body's pool transform (road top, before the
 * lift); `travel` is the signed distance the vehicle has moved along its own forward axis, so each wheel turns by
 * travel / radius about its axle (the body-local X axis). Wheel GLBs face +X (hub cap outward on the right side); the
 * left wheels are turned half a revolution about Y so their hub caps face out too.
 */
export function vehicleWheelPoses(pool: IdolPoolKey, x: number, roadY: number, z: number, bodyYaw: number, travel: number): IdolWheelPose[] {
  const layout = idolWheelLayout(pool);
  if (!layout) return [];
  const sx = idolScale(pool)[0];
  const wheelPool = layout.rail ? "railWheel" : "wheel";
  const wheelHeight = idolHeight(IDOL_POOL_ASSET[wheelPool]); // wheel GLBs are centred on their hub
  const c = Math.cos(bodyYaw), s = Math.sin(bodyYaw);
  return layout.hubs.map(([hx, hy, hz], i) => {
    const r = layout.radii[i] ?? layout.radius;
    const spin = travel / r;
    const lx = hx * sx, ly = hy + layout.lift, lz = hz;
    const left = hx < 0;
    return {
      pool: wheelPool,
      position: [x + lx * c + lz * s, roadY + ly, z - lx * s + lz * c],
      rotation: composeCharacterEulerXYZ(bodyYaw + (left ? Math.PI : 0), left ? -spin : spin, 0),
      scale: (2 * r) / wheelHeight
    };
  });
}

/** Asset key of the Idol model a critter id renders with (part poses are keyed by it; see critterRig.ts). */
export function idolCritterKey(id: CritterAssetId): string {
  return `hopCritter${id[0]!.toUpperCase()}${id.slice(1)}`;
}
