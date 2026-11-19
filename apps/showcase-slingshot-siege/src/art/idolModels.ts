/**
 * Slingshot Siege: Idol wow pass (2026-11). The models the player sees most, the five hero birds, the three raider
 * ranks, the slingshot, the far island set pieces and the island landmarks, drawn as image-to-3D GLBs generated with
 * speridlabs/idol/max (spec: tools/idol/specs/slingshot-siege.json, provenance: ../../assets/idol/<key>.idol.json).
 *
 * Render layer only. Every GLB was normalised by the generator to the old procedural model's measured size (ground at
 * y 0, facing +Z), so the nodes below keep the old builders' runtime ids, transforms, pools and tags: the sim, the
 * presenter's pose/scale tweens, the replay data and the camera are untouched. Fortress blocks, crates, barrels and
 * planks in the physics pools stay procedural (their box dimensions are the collision shapes).
 */
import { model, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import type { AmmoId } from "../game/ammo";
import {
  FG_BARRELS,
  FG_CRATES,
  FLAG_BASTION_PLACEMENT,
  GATEHOUSE_PLACEMENT,
  STONE_BRIDGE_PLACEMENT,
  WATCHTOWER_PLACEMENT,
  WINDMILL_PLACEMENT,
  type DecorPlacement
} from "../game/decorLayout";

// Placements live in ../game/decorLayout.ts (shared with the sim's static decor colliders); re-exported for callers.
export { FG_BARRELS, FG_CRATES, WINDMILL_PLACEMENT };

type V3 = [number, number, number];
type NodeOut = AuraNodeBuilder<AuraSceneNode>;

/**
 * Birds are three Idol pieces each (creature pass, "they're just sliding"): a wingless body (`siegeBird<Ammo>Body`) and
 * two copies of a detached wing (`siegeBird<Ammo>Wing`, re-based so the shoulder root is the GLB origin, span +X, broad
 * face +/-Z). The body keeps the old runtime id, pose and pool; each wing is its own runtime node (`<id>-wing-l/r`) that
 * main.ts re-attaches to the body's shoulder every frame (`birdWingPoses`) and flaps in flight / tucks with an idle
 * twitch on the perch (`birdFlapAngle`).
 */
export const IDOL_BIRD = {
  pebble: assets.siegeBirdPebbleBody,
  stone: assets.siegeBirdStoneBody,
  triple: assets.siegeBirdTripleBody,
  squid: assets.siegeBirdSquidBody,
  ember: assets.siegeBirdEmberBody
} as const satisfies Record<AmmoId, unknown>;
export const IDOL_BIRD_WING = {
  pebble: assets.siegeBirdPebbleWing,
  stone: assets.siegeBirdStoneWing,
  triple: assets.siegeBirdTripleWing,
  squid: assets.siegeBirdSquidWing,
  ember: assets.siegeBirdEmberWing
} as const satisfies Record<AmmoId, unknown>;
/** Right wings: the left wing baked as its mirror image (span -X), so the feather cup mirrors instead of flipping. */
export const IDOL_BIRD_WING_R = {
  pebble: assets.siegeBirdPebbleWingR,
  stone: assets.siegeBirdStoneWingR,
  triple: assets.siegeBirdTripleWingR,
  squid: assets.siegeBirdSquidWingR,
  ember: assets.siegeBirdEmberWingR
} as const satisfies Record<AmmoId, unknown>;

/**
 * Left shoulder (+X side) in body-local metres at scale 1 (bodies face +Z): half the measured torso width at 40 % of
 * the height less a 6 cm inset, at mid height, slightly behind centre. The right shoulder mirrors x.
 */
export const BIRD_SHOULDER: Readonly<Record<AmmoId, V3>> = {
  pebble: [0.44, 0.71, -0.05],
  stone: [0.6, 0.8, -0.05],
  triple: [0.41, 0.68, -0.05],
  squid: [0.43, 0.67, -0.05],
  ember: [0.5, 0.72, -0.05]
};

/** Runtime ids of every bird body the stage mounts, with its ammo (filled by `idolBirdNode`). */
export const BIRD_NODES = new Map<string, AmmoId>();
export const birdWingIds = (bodyId: string): readonly [string, string] => [`${bodyId}-wing-l`, `${bodyId}-wing-r`];

/** Folded (perched) wing angle, rad: the span hangs down and back along the body side. */
export const WING_FOLDED = -1.25;
/**
 * The wing angle about the body's forward axis at time `t` (0 = spread level, + = up). Flying birds flap at 7 Hz
 * through +/-0.75 rad around a slight dihedral; perched birds keep their wings tucked with a small, slow twitch.
 */
export function birdFlapAngle(t: number, flying: boolean, phase = 0): number {
  return flying ? 0.15 + 0.75 * Math.sin(t * Math.PI * 2 * 7 + phase) : WING_FOLDED + 0.06 * Math.sin(t * 2.3 + phase) + (Math.sin(t * 0.9 + phase) > 0.97 ? 0.25 : 0);
}

// Rotation matrices for the engine's Euler convention (R = Rz * Ry * Rx; rows are output axes).
type M3 = [number, number, number, number, number, number, number, number, number];
function eulerToM3(e: readonly number[]): M3 {
  const [x, y, z] = e as [number, number, number];
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx
  ];
}
function mulM3(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) o[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return o;
}
function m3ToEuler(m: M3): V3 {
  const sy = Math.max(-1, Math.min(1, -m[6]));
  const y = Math.asin(sy);
  if (Math.abs(sy) < 0.99999) return [Math.atan2(m[7], m[8]), y, Math.atan2(m[3], m[0])];
  return [Math.atan2(-m[5], m[4]), y, 0];
}
const applyM3 = (m: M3, v: readonly number[]): V3 => [m[0] * v[0]! + m[1] * v[1]! + m[2] * v[2]!, m[3] * v[0]! + m[4] * v[1]! + m[5] * v[2]!, m[6] * v[0]! + m[7] * v[1]! + m[8] * v[2]!];

/** Engine Euler -> rotation matrix, exported for the tests. */
export { eulerToM3, applyM3 };

export interface BodyPose { readonly position: readonly number[]; readonly rotation: readonly number[]; readonly scale: number | readonly number[] }
export interface WingPose { readonly position: V3; readonly rotation: V3; readonly scale: number }

/**
 * World poses of the two wings for a body pose. Wing local frame: the left wing is turned flat (Rx -90 deg: feathers trailing back, broad face
 * up) with its span out along +X, then lifted by `angle` about the body's forward (Z) axis at the shoulder; the right
 * wing (the mirrored GLB, span along -X) gets the same flat turn and is lifted by -angle.
 */
export function birdWingPoses(ammo: AmmoId, body: BodyPose, angle: number): readonly [WingPose, WingPose] {
  const s = typeof body.scale === "number" ? body.scale : ((body.scale[0]! + body.scale[1]! + body.scale[2]!) / 3);
  const R = eulerToM3(body.rotation);
  const sh = BIRD_SHOULDER[ammo] ?? BIRD_SHOULDER.pebble;
  const flat = eulerToM3([-Math.PI / 2, 0, 0]);
  const out = ([1, -1] as const).map((side) => {
    const local = mulM3(eulerToM3([0, 0, side * angle]), flat);
    const off = applyM3(R, [side * sh[0] * s, sh[1] * s, sh[2] * s]);
    return { position: [body.position[0]! + off[0], body.position[1]! + off[1], body.position[2]! + off[2]] as V3, rotation: m3ToEuler(mulM3(R, local)), scale: s };
  });
  return [out[0]!, out[1]!];
}

/** Raider ranks: slot 0 King, odd slots Knight, other slots Grunt (as `buildRaiderBossNode`). */
export const IDOL_RAIDER = [assets.siegeRaiderKing, assets.siegeRaiderKnight, assets.siegeRaiderGrunt] as const;

/** Drop-in for `buildHeroSiegeBirdNode`: the body keeps its runtime id and tag; the two wings follow (see above). */
export function idolBirdNode(
  name: string,
  ammo: AmmoId,
  position: V3,
  rotationY: number,
  scaleVal: number,
  runtimeId: string,
  tag: string,
  castShadow = true
): NodeOut[] {
  BIRD_NODES.set(runtimeId, ammo);
  const body = { position, rotation: [0, rotationY, 0], scale: scaleVal };
  const wings = birdWingPoses(ammo, body, WING_FOLDED);
  const ids = birdWingIds(runtimeId);
  return [
    model(IDOL_BIRD[ammo] ?? IDOL_BIRD.pebble, {
      name, position, rotation: [0, rotationY, 0], scale: scaleVal, scaleMode: "world", castShadow, receiveShadow: true
    }).runtime({ id: runtimeId, tags: [tag] }) as unknown as NodeOut,
    ...wings.map((w, i) => model(i === 0 ? IDOL_BIRD_WING[ammo] : IDOL_BIRD_WING_R[ammo], {
      name: ids[i], position: w.position, rotation: w.rotation, scale: w.scale, scaleMode: "world", castShadow, receiveShadow: true
    }).runtime({ id: ids[i]!, tags: [tag, "wing"] }) as unknown as NodeOut)
  ];
}

/**
 * Raider body motion (creature pass): a living raider waddles (roll about its forward axis) and breathes (vertical
 * scale pulse) on top of the idle bob/yaw main.ts already applies; slot `g` de-phases neighbours.
 */
export function raiderWobble(t: number, g: number): { readonly roll: number; readonly breathe: number } {
  return { roll: 0.08 * Math.sin(t * 3.4 + g * 1.7), breathe: 1 + 0.035 * Math.sin(t * 2.2 + g * 0.8) };
}

/** Drop-in for `buildRaiderBossNode`: parked under the island, posed by `syncGull` (position, yaw, squash scale). */
export function idolRaiderNode(slot: number, runtimeId: string): NodeOut {
  const rank = slot === 0 ? 0 : slot % 2 === 1 ? 1 : 2;
  return model(IDOL_RAIDER[rank]!, {
    name: runtimeId,
    position: [0, -120, 0],
    rotation: [0, -Math.PI * 0.45, 0],
    scale: [0.54, 0.54, 0.54],
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).runtime({ id: runtimeId, tags: ["gull"] }) as unknown as NodeOut;
}

/**
 * Slingshot: the Idol base (sled, stone deck, rope winch, iron socket) under the Idol Y-fork, both measured on the
 * normalised GLBs. The base (1.50 x 1.24 x 1.58 m; socket rim centred at local (-0.10, 0.71, 0.10)) is drawn at 0.8
 * 0.12-0.16 m into the launch deck (base y 0.30, deck 0.42-0.46) with its winch behind the fork, so the socket rim sits
 * at world (-7.79, 0.868, 0). The fork
 * (1.24 m; prong tips at local x +/-0.325, y 1.215, z 0) is turned so its prongs run along z, scaled 0.68 across so
 * the tips land on the band anchors `FORK_TIPS` in main.ts ([-7.79, 1.89, +/-0.22]) and 0.88 tall so its foot sits in
 * the socket (y 0.82). The bands and the pouch stay the stage's own nodes.
 */
export const SLING_BASE_PLACEMENT = { position: [-7.71, 0.3, -0.08] as V3, rotationY: 0, scale: 0.8 } as const;
export const SLING_FORK_PLACEMENT = { position: [-7.79, 0.82, 0] as V3, rotationY: Math.PI * 0.5, scale: [0.68, 0.88, 0.68] as V3 } as const;

/** Drop-in for `buildSiegeSlingshotRigNode` (keeps its runtime id and tag; the authored position is the Idol placement). */
export function idolSlingshotBaseNode(runtimeId: string): NodeOut {
  return model(assets.siegeSlingshotBase, {
    name: "slingshot-base",
    position: SLING_BASE_PLACEMENT.position,
    rotation: [0, SLING_BASE_PLACEMENT.rotationY, 0],
    scale: SLING_BASE_PLACEMENT.scale,
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).runtime({ id: runtimeId, tags: ["sling"] }) as unknown as NodeOut;
}

export function idolSlingshotForkNode(): NodeOut {
  return model(assets.siegeSlingshotFork, {
    name: "slingshot-yoke",
    position: SLING_FORK_PLACEMENT.position,
    rotation: [0, SLING_FORK_PLACEMENT.rotationY, 0],
    scale: SLING_FORK_PLACEMENT.scale,
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }) as unknown as NodeOut;
}

/** Far island set pieces (presentation only: no shadow, no collider). Positions come from ../art/setPieces.ts. */
export function idolFarPieceNode(
  asset: (typeof assets)[keyof typeof assets],
  id: string,
  position: V3,
  rotationY: number,
  visible: boolean,
  runtime = true
): NodeOut {
  const b = model(asset as never, {
    name: id,
    position,
    rotation: [0, rotationY, 0],
    scaleMode: "world",
    castShadow: false,
    receiveShadow: false,
    visible
  });
  return (runtime ? b.runtime({ id, tags: ["backdrop"] }) : b) as unknown as NodeOut;
}

/** Island landmarks: same world placement as the procedural builders they replace. */
export function idolWatchtowerNode(runtimeId: string): NodeOut {
  return model(assets.siegeWatchtower, {
    name: runtimeId, position: [...WATCHTOWER_PLACEMENT.position], rotation: [...WATCHTOWER_PLACEMENT.rotation], scaleMode: "world", castShadow: true, receiveShadow: true
  }).runtime({ id: runtimeId, tags: ["dressing"] }) as unknown as NodeOut;
}

export function idolGatehouseNode(runtimeId: string): NodeOut {
  return model(assets.siegeGatehouse, {
    name: runtimeId, position: [...GATEHOUSE_PLACEMENT.position], rotation: [...GATEHOUSE_PLACEMENT.rotation], scaleMode: "world", castShadow: true, receiveShadow: true
  }).runtime({ id: runtimeId, tags: ["dressing"] }) as unknown as NodeOut;
}

/**
 * Moving-parts pass: the island windmill is an Idol tower without sails (`siegeWindmillBody`, axle tip measured at local
 * (0.008, 3.579, 1.725)) plus a separate Idol sail cross (`siegeWindmillSails`, re-based so its hub centre is the GLB
 * origin and its axle is local +X). The sail node sits on the axle tip and turns about the axle every frame
 * (`windmillSailPose`), driven from main.ts with game time.
 */
export const WINDMILL_AXLE_LOCAL: V3 = [0.008, 3.579, 1.725];
/** Sail turn rate, rad/s (a lazy sea breeze). */
export const WINDMILL_SAIL_RATE = 0.55;
export const WINDMILL_SAILS_ID = "prop-windmill-sails";

/** World position of the axle tip (the sail hub centre). */
export function windmillHubWorld(): V3 {
  const [x, y, z] = WINDMILL_AXLE_LOCAL;
  const a = WINDMILL_PLACEMENT.rotationY, c = Math.cos(a), s = Math.sin(a);
  const p = WINDMILL_PLACEMENT.position;
  // The engine's Y rotation: x' = c x + s z, z' = -s x + c z.
  return [p[0] + c * x + s * z, p[1] + y, p[2] - s * x + c * z];
}

/**
 * The sail cross pose at game time `t`: Euler [spin, yaw, 0] (the engine applies X, then Y), so the cross turns about
 * its own axle (local +X) and the axle is then yawed onto the tower's front (+Z of the body, hence yaw - pi/2).
 */
export function windmillSailPose(t: number): { position: V3; rotation: V3 } {
  return { position: windmillHubWorld(), rotation: [t * WINDMILL_SAIL_RATE, WINDMILL_PLACEMENT.rotationY - Math.PI / 2, 0] };
}

export function idolWindmillPropNodes(runtimeId: string): NodeOut[] {
  const pose = windmillSailPose(0);
  return [
    model(assets.siegeWindmillBody, {
      name: runtimeId, position: WINDMILL_PLACEMENT.position, rotation: [0, WINDMILL_PLACEMENT.rotationY, 0], scaleMode: "world", castShadow: true, receiveShadow: true
    }).runtime({ id: runtimeId, tags: ["dressing"] }) as unknown as NodeOut,
    model(assets.siegeWindmillSails, {
      name: WINDMILL_SAILS_ID, position: pose.position, rotation: pose.rotation, scaleMode: "world", castShadow: true, receiveShadow: true
    }).runtime({ id: WINDMILL_SAILS_ID, tags: ["dressing", "spin"] }) as unknown as NodeOut
  ];
}

export function idolStoneBridgeNode(): NodeOut {
  return model(assets.siegeStoneBridge, {
    name: "prop-stone-bridge", position: [...STONE_BRIDGE_PLACEMENT.position], rotation: [...STONE_BRIDGE_PLACEMENT.rotation], scaleMode: "world", castShadow: false, receiveShadow: true
  }) as unknown as NodeOut;
}

export function idolFlagBastionNode(): NodeOut {
  return model(assets.siegeFlagBastion, {
    name: "fortress-flag-bastion", position: [...FLAG_BASTION_PLACEMENT.position], scaleMode: "world", castShadow: true, receiveShadow: true
  }) as unknown as NodeOut;
}

/**
 * Decorative dressing is drawn as plain, id-less `model()` nodes, one per placement: no instancing, no runtime id, no
 * physics, no wind. QA saw a decorative pine and its turf disc fly off the cliff right after a level clear, while the
 * fortress debris and prop pools (`setInstances` every frame on instanced pool nodes) were flying; drawing the decor as
 * independent, never-written nodes takes it out of every instance buffer and every per-frame write path.
 */
function decorNode(asset: (typeof assets)[keyof typeof assets], name: string, t: DecorPlacement): NodeOut {
  return model(asset as never, { name, position: [...t.position], rotation: [...t.rotation], scale: t.scale, scaleMode: "world", castShadow: false, receiveShadow: true }) as unknown as NodeOut;
}

export function idolForegroundPropNodes(): NodeOut[] {
  return [
    ...FG_CRATES.map((t, i) => decorNode(assets.siegeCrate, `fg-crate-${i}`, t)),
    ...FG_BARRELS.map((t, i) => decorNode(assets.siegeBarrel, `fg-barrel-${i}`, t))
  ];
}

/**
 * Coastal pines: the Idol toy pine on its own little turf disc (9.5 m tall at scale 1, as the procedural pair), one
 * plain decor node per placement (see `decorNode`): anchored where `pineTransforms` puts it, never written at runtime.
 */
export function idolCoastalPinesNodes(
  transforms: readonly { readonly position: V3; readonly rotation: V3; readonly scale: number }[]
): NodeOut[] {
  return transforms.map((t, i) => decorNode(assets.siegePineTree, `island-tree-${i}`, { position: [...t.position] as V3, rotation: [...t.rotation] as V3, scale: t.scale }));
}
