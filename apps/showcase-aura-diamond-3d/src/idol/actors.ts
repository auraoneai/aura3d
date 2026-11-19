/**
 * Aura Diamond 3D Idol pass: scene nodes for the image-to-3D (speridlabs/idol/max) athletes and ballpark set pieces.
 * Each athlete is the same runtime group id the procedural rig used (`pitcher`, `f-ss`, `batter`, ...) holding one rigged
 * Idol GLB (`<id>-idol`); main.ts drives its skeleton from the game rig every frame (src/idol/drive.ts). GLBs are generated
 * at their game size (metres, grounded, facing +Z) so every model uses scaleMode "world".
 */
import { game, groups, instances, model } from "@aura3d/engine";

type AuraInstanceTransform = { readonly position?: readonly number[]; readonly rotation?: readonly number[]; readonly scale?: readonly number[] };
import { idolAssets, idolAssets as assets } from "../aura-assets.idol";
import { idolAthletesEnabled, idolKeyForActor, type IdolAthleteKey } from "./drive";

export const IDOL_ATHLETE_ASSETS = {
  diaIdolFielderA: assets.diaIdolFielderA,
  diaIdolFielderB: assets.diaIdolFielderB,
  diaIdolBatterA: assets.diaIdolBatterA,
  diaIdolCatcher: assets.diaIdolCatcher
} as const satisfies Record<IdolAthleteKey, unknown>;

type IdolModelRef = (typeof idolAssets)["diaIdolFielderA"];
const admitted = assets as unknown as Readonly<Record<string, IdolModelRef | undefined>>;

/**
 * Ballpark set pieces; a piece whose GLB is not admitted keeps its procedural builder. Dugouts, the grandstand shells, the
 * windmill and the rowhouses stay procedural: Idol reconstructed the open dugout and the two-deck stand as broken shells.
 */
export const IDOL_SET_ASSETS = {
  lightTower: admitted.diaIdolLightPole,
  scoreboard: admitted.diaIdolScoreboard,
  lighthouse: admitted.diaIdolLighthouse,
  waterTower: admitted.diaIdolWaterTower,
  lunarRover: admitted.diaIdolLunarRover,
  juniper: admitted.diaIdolJuniper
} as const;

/** The admitted GLB for a set piece when the Idol pass is on (`?idol=0` keeps every procedural piece). */
export function idolSet(name: keyof typeof IDOL_SET_ASSETS): IdolModelRef | undefined {
  return idolAthletesEnabled() ? IDOL_SET_ASSETS[name] : undefined;
}

type V3 = [number, number, number];

/** One Idol athlete: actor group `id` (positioned / yawed / hidden by main.ts like the procedural rig) + the skinned GLB. */
export function buildIdolAthleteNode(id: string, options: { readonly position?: V3; readonly yaw?: number; readonly visible?: boolean } = {}): any {
  const key = idolKeyForActor(id);
  const body = model(IDOL_ATHLETE_ASSETS[key], {
    name: `${id}-idol`,
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).runtime(game.runtimeNode(`${id}-idol`, { tags: ["typed-asset", "idol-athlete"] }));
  const pos = options.position ?? [0, -80, 0];
  const node = groups.create(id, [body], { position: pos, rotation: [0, options.yaw ?? 0, 0] }).runtime(game.runtimeNode(id));
  if (options.visible === false) {
    const json = node.toJSON() as unknown as Record<string, unknown>;
    return { ...json, visible: false };
  }
  return node;
}

/** A single Idol set piece at a world transform (static dressing, no runtime handle). */
export function idolSetPiece(asset: IdolModelRef, name: string, position: readonly number[], yaw = 0, scale = 1, castShadow = false): any {
  const n = model(asset, { name, scaleMode: "world", castShadow, receiveShadow: true }).position(position[0]!, position[1]!, position[2]!).rotate(0, yaw, 0);
  return scale === 1 ? n : n.scale([scale, scale, scale]);
}

/** Repeated Idol set pieces in one instanced draw. */
export function idolSetInstances(asset: IdolModelRef, name: string, transforms: readonly AuraInstanceTransform[], castShadow = false): any {
  return instances.model(asset, { name, scaleMode: "world", castShadow, receiveShadow: true, transforms: transforms.map((t) => ({ ...t })) } as any);
}

/**
 * How each Idol set piece replaces its procedural builder: extra yaw on top of the builder's yaw (the procedural pieces do
 * not all face +Z), uniform scale against the generated size, and a height offset. Tuned from the 4-view previews.
 */
export const IDOL_SET_FIT = {
  /** procedural tower: lamps aim local -Z; the GLB's lamps face +Z, so turn half a turn. Generated 16 m tall (the towers' height). */
  lightTower: { yaw: Math.PI, scale: 1, y: 0 },
  /** stone foundation sunk 0.12 m so its rough base never shows a gap on the headland */
  lighthouse: { yaw: 0, scale: 1, y: -0.12 },
  /** procedural tank tops out near 18.2 m; generated 22 m */
  waterTower: { yaw: 0, scale: 18.2 / 22, y: -0.08 },
  /** procedural rover is about 3.3 m long over the wheels; generated 3.6 m */
  lunarRover: { yaw: 0, scale: 0.9, y: 0 },
  /** the GLB grounds on its gravel mound's lowest pebble: sink 0.15 m so the mound never floats on the canyon floor */
  juniper: { yaw: 0, scale: 1, y: -0.15 }
} as const;
