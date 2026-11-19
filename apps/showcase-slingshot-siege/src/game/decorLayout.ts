/**
 * Slingshot Siege: where the solid-looking island decor stands, and the static colliders that make it solid.
 *
 * Pass-through pass (owner, 2026-11-18: "it just runs right through rather than stopping"). The decor GLBs are plain,
 * never-written render nodes (see `decorNode` in ../art/idolModels.ts), so on their own a shot, a tumbling block or a
 * debris chip flies straight through a pine, a crate or the gatehouse. Two rules now hold, both pinned by
 * tests/unit/slingshot-siege/decor-pass-through.test.ts:
 *
 *  1. Nothing solid stands in the play volume: the flight lane (sling to the right wall along z = 0) and every level's
 *     fortress (its pieces, gulls and windmill rotors at spawn). The fortress flag bastion and its mast stood inside the
 *     fort (every level's blocks spawned through them), the island windmill's tower and sails cut through the fort's
 *     back walls in four levels, and the east pine stood in two levels' side walls: all moved out, re-grounded; the
 *     front-right sea-cliff moved 0.45 m seaward out of five levels' front-right corners.
 *  2. Every solid-looking decor piece gets a static, immovable box collider sized to its visual bounds
 *     (`DECOR_COLLIDERS`, added by `SiegeSim` after the level's own bodies). Static bodies never move, so the decor can
 *     not jump or fly when the fortress collapses or the level switches; the render nodes are still never written.
 *
 * Pure data (no engine imports): the sim, the stage and the tests all read these numbers.
 */

export type V3 = [number, number, number];

export interface DecorPlacement {
  readonly position: V3;
  readonly rotation: V3;
  readonly scale: number;
}

/**
 * Coastal pines (one plain decor node each). Idol grounding pass: each toy pine's turf disc sits 0.1-0.2 m into the
 * surface sampled under its footprint (tests/unit/slingshot-siege/idol-grounding.test.ts). The first pine moved 1.1 m onto
 * the cliff top (it hung over the cliff edge), the two east pines 0.6-0.9 m inland off the waterline. Pass-through pass:
 * pine 2 moved 2.3 m west so the windmill's new footing does not swallow it, pine 4 moved 0.6 m north-west out of the
 * side walls of levels 25 and 30.
 */
export const PINE_TRANSFORMS: readonly DecorPlacement[] = [
  { position: [-11.3, 0.77, -2.8], rotation: [0, 0.3, 0], scale: 0.25 },
  { position: [-5.1, -0.17, -3.7], rotation: [0, 1.2, 0], scale: 0.22 },
  { position: [1.5, -0.16, -4.6], rotation: [0, 2.1, 0], scale: 0.26 },
  { position: [10.2, -0.26, -2.4], rotation: [0, 3.0, 0], scale: 0.27 },
  { position: [10.4, -0.35, 2.6], rotation: [0, 4.1, 0], scale: 0.22 }
];

/** Sun-bleached limestone sea-cliffs (one instanced draw; the turf caps share the transforms). */
export const CLIFF_TRANSFORMS: readonly { readonly position: V3; readonly rotation: V3; readonly scale: V3 }[] = [
  { position: [-13.2, 0.65, -9.8], rotation: [0.04, 0.38, -0.03], scale: [4.2, 2.3, 2.6] },
  { position: [-6.4, 0.95, -11.4], rotation: [-0.03, 0.92, 0.02], scale: [5.4, 2.9, 3.0] },
  { position: [1.8, 1.15, -12.2], rotation: [0.02, 1.74, -0.04], scale: [6.2, 3.3, 3.2] },
  { position: [9.6, 0.9, -11.0], rotation: [-0.04, 0.68, 0.03], scale: [5.0, 2.7, 2.8] },
  { position: [14.8, 0.6, -8.8], rotation: [0.03, 1.35, -0.02], scale: [3.8, 2.1, 2.4] },
  { position: [-6.4, 0.42, -5.4], rotation: [0, 0.52, 0], scale: [3.6, 1.35, 2.3] },
  { position: [9.6, 0.48, -4.9], rotation: [0, -0.44, 0], scale: [3.9, 1.45, 2.5] },
  { position: [-11.4, 0.32, -2.8], rotation: [0, 0.6, 0], scale: [2.5, 1.1, 1.9] },
  // Pass-through pass: was z 3.1, where its rock stood in the fort's front-right corner on levels 5/14/25/28/30.
  { position: [8.4, 0.28, 3.55], rotation: [0, 1.42, 0], scale: [2.1, 0.92, 1.6] }
];

export const WATCHTOWER_PLACEMENT: DecorPlacement = { position: [-12.4, -0.41, 4.2], rotation: [0, 0.5, 0], scale: 1 };
export const GATEHOUSE_PLACEMENT: DecorPlacement = { position: [9.8, -0.3, -2.4], rotation: [0, -0.45, 0], scale: 1 };
export const STONE_BRIDGE_PLACEMENT: DecorPlacement = { position: [0.2, -0.12, -2.4], rotation: [0, 0.12, 0], scale: 1 };
/** Pass-through pass: was (7.2, -0.12, -0.6), inside every level's fort; now behind it, between windmill and gatehouse. */
export const FLAG_BASTION_PLACEMENT: DecorPlacement = { position: [6.6, -0.15, -3.0], rotation: [0, 0, 0], scale: 1 };
/** Pass-through pass: was (4.2, -0.16, -3.2); 0.8 m back so tower and sails clear the back walls of levels 15/24/25/30. */
export const WINDMILL_PLACEMENT = { position: [4.2, -0.16, -4.0] as V3, rotationY: 0.25 } as const;

/** The fortress mast stands in the bastion's socket: x/z of the mast, its radius and vertical span. */
export const FLAG_MAST = {
  x: FLAG_BASTION_PLACEMENT.position[0],
  z: FLAG_BASTION_PLACEMENT.position[2],
  radius: 0.0375,
  y0: 0.95,
  y1: 5.65
} as const;
/** The foreground banner pole (left of the fort, in front of the lane). */
export const BANNER_POLE = { x: 6.3, z: 5.15, radius: 0.03, y0: 0, y1: 2.7 } as const;

/**
 * Foreground crates and kegs. `position` is the grounded base (the GLBs are grounded at y 0), sunk 0.1-0.2 m into the
 * surface under the footprint; a stacked crate sits on the one below it.
 */
export const FG_CRATES: readonly DecorPlacement[] = [
  { position: [-4.9, -0.25, 4.6], rotation: [0, 0.35, 0], scale: 0.44 },
  // stacked on the first crate (its top is at -0.25 + 1.672 * 0.44 = 0.486)
  { position: [-4.95, 0.47, 4.55], rotation: [0, 0.9, 0], scale: 0.32 },
  // in the shallows by the sling (sea level -0.26)
  { position: [-10.2, -0.41, 3.6], rotation: [0, 0.7, 0], scale: 0.34 }
];
export const FG_BARRELS: readonly DecorPlacement[] = [
  { position: [-4.0, -0.2, 4.95], rotation: [0, 0.2, 0], scale: 0.44 },
  { position: [-9.6, -0.41, 4.1], rotation: [0, 0.5, 0], scale: 0.36 }
];

/**
 * Grounded local bounds of each decor mesh at scale 1: the GLBs' `boundsMetadata` in aura.assets.json, and the
 * faceted cliff mesh (`buildFacetedSeaCliffMesh(11)`). The test re-reads both sources and fails if they drift.
 */
export const DECOR_LOCAL_BOUNDS = {
  siegePineTree: { min: [-3.401, 0, -2.876], max: [3.401, 9.5, 2.876] },
  siegeWatchtower: { min: [-1.985, 0, -2.049], max: [1.985, 6.04, 2.049] },
  siegeGatehouse: { min: [-2.183, 0, -0.725], max: [2.183, 4.14, 0.725] },
  siegeWindmillBody: { min: [-1.344, 0, -1.751], max: [1.344, 4.7, 1.751] },
  siegeStoneBridge: { min: [-1.92, 0, -0.845], max: [1.92, 1.555, 0.845] },
  siegeFlagBastion: { min: [-0.545, 0, -0.548], max: [0.545, 1.24, 0.548] },
  siegeCrate: { min: [-0.825, 0, -0.84], max: [0.825, 1.672, 0.84] },
  siegeBarrel: { min: [-0.602, 0, -0.599], max: [0.602, 1.5, 0.599] },
  cliff: { min: [-0.574, -0.478, -0.524], max: [0.606, 0.52, 0.509] }
} as const satisfies Record<string, { readonly min: readonly number[]; readonly max: readonly number[] }>;
export type DecorMesh = keyof typeof DECOR_LOCAL_BOUNDS;

/**
 * How much of the visual bounding box the collider fills, across (x/z) and up (y). A box fills a crate, a bastion or
 * a gatehouse; a pine is a cone over a wide turf disc, so its box hugs the trunk and the lower canopy; the windmill
 * body's box drops the axle stub that sticks out in front; the watchtower and cliffs taper towards the top.
 */
export const DECOR_FILL: Readonly<Record<DecorMesh, { readonly xz: number; readonly y: number }>> = {
  siegePineTree: { xz: 0.45, y: 1 },
  siegeWatchtower: { xz: 0.8, y: 1 },
  siegeGatehouse: { xz: 0.95, y: 1 },
  siegeWindmillBody: { xz: 0.75, y: 1 },
  siegeStoneBridge: { xz: 0.95, y: 1 },
  siegeFlagBastion: { xz: 0.95, y: 1 },
  siegeCrate: { xz: 0.95, y: 1 },
  siegeBarrel: { xz: 0.9, y: 1 },
  cliff: { xz: 0.85, y: 1 }
};

/** A static box collider: world centre, half extents along its own axes, yaw about +Y (engine convention). */
export interface DecorCollider {
  readonly name: string;
  readonly mesh: DecorMesh | "pole";
  readonly center: V3;
  readonly half: V3;
  readonly yaw: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Collider of a decor mesh placed at `p` (uniform or per-axis scale, yaw only: decor stands upright). */
export function meshCollider(name: string, mesh: DecorMesh, p: { readonly position: readonly number[]; readonly rotation: readonly number[]; readonly scale: number | readonly number[] }): DecorCollider {
  const b = DECOR_LOCAL_BOUNDS[mesh];
  const f = DECOR_FILL[mesh];
  const s = typeof p.scale === "number" ? [p.scale, p.scale, p.scale] : p.scale;
  const yaw = p.rotation[1] ?? 0;
  const lc = [((b.min[0] + b.max[0]) / 2) * s[0]!, ((b.min[1] + b.max[1]) / 2) * s[1]!, ((b.min[2] + b.max[2]) / 2) * s[2]!];
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  // The engine's Y rotation: x' = c x + s z, z' = -s x + c z.
  const center: V3 = [r3(p.position[0]! + c * lc[0]! + sn * lc[2]!), r3(p.position[1]! + lc[1]!), r3(p.position[2]! - sn * lc[0]! + c * lc[2]!)];
  const half: V3 = [
    r3(((b.max[0] - b.min[0]) / 2) * s[0]! * f.xz),
    r3(((b.max[1] - b.min[1]) / 2) * s[1]! * f.y),
    r3(((b.max[2] - b.min[2]) / 2) * s[2]! * f.xz)
  ];
  return { name, mesh, center, half, yaw };
}

function poleCollider(name: string, pole: { readonly x: number; readonly z: number; readonly radius: number; readonly y0: number; readonly y1: number }): DecorCollider {
  return { name, mesh: "pole", center: [pole.x, r3((pole.y0 + pole.y1) / 2), pole.z], half: [pole.radius, r3((pole.y1 - pole.y0) / 2), pole.radius], yaw: 0 };
}

/** Every solid-looking decor piece of the (GU47 / Idol) stage, as a static collider. */
export const DECOR_COLLIDERS: readonly DecorCollider[] = [
  ...PINE_TRANSFORMS.map((t, i) => meshCollider(`island-tree-${i}`, "siegePineTree", t)),
  ...CLIFF_TRANSFORMS.map((t, i) => meshCollider(`coastal-limestone-cliffs#${i}`, "cliff", t)),
  meshCollider("prop-watchtower", "siegeWatchtower", WATCHTOWER_PLACEMENT),
  meshCollider("prop-gatehouse", "siegeGatehouse", GATEHOUSE_PLACEMENT),
  meshCollider("prop-windmill", "siegeWindmillBody", { position: WINDMILL_PLACEMENT.position, rotation: [0, WINDMILL_PLACEMENT.rotationY, 0], scale: 1 }),
  meshCollider("prop-stone-bridge", "siegeStoneBridge", STONE_BRIDGE_PLACEMENT),
  meshCollider("fortress-flag-bastion", "siegeFlagBastion", FLAG_BASTION_PLACEMENT),
  poleCollider("fortress-flag-mast", FLAG_MAST),
  poleCollider("fg-banner-pole", BANNER_POLE),
  ...FG_CRATES.map((t, i) => meshCollider(`fg-crate-${i}`, "siegeCrate", t)),
  ...FG_BARRELS.map((t, i) => meshCollider(`fg-barrel-${i}`, "siegeBarrel", t))
];
