/**
 * Splat Turf Idol pass (presentation only): high-detail image-to-3D GLBs (`speridlabs/idol/max`, admitted through
 * `tools/idol/admit.sh`, specs in `tools/idol/specs/splat-turf.json` and owned copies of Splat Rush's sky islands,
 * generated once from `tools/idol/specs/splat-rush-port.json`) replace the code-built hero rover, rival eraser karts, aerosol cans,
 * roadside paint buckets, arena sideline set pieces, finish gantry and sky islands.
 *
 * The paint simulation is untouched: the wet-ink splat ribbon, road deck, curbs, solvent strips, lamp posts, islets,
 * clouds and particles stay procedural, so every surface that receives paint is still the GPU splat ribbon.
 * Pooled entities use `instances.model` with dense `setInstanceMatrices` writes (one draw per GLB, no per-entity nodes).
 */
import { group, instances, model, type AuraApp, type AuraAssetRef } from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import type { TurfBackdropKind, TurfBackdropPiece } from "./proceduralModels";
import { trs, type KartLayout, type Mat4 } from "./kartRig";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type ModelRef = AuraAssetRef<"model">;
type Rgb = readonly [number, number, number];

/** Idol GLB dimensions after `tools/idol/normalize.mjs` (x width, y height, z length; grounded at y = 0, centred in x/z, front +Z). */
export const IDOL_DIMS = {
  turfHeroKartShell: [1.225, 0.822, 1.25],
  turfRivalKartShell: [0.847, 0.795, 1.15],
  turfKartWheel: [0.162, 0.36, 0.358],
  turfScrubBrush: [1.1, 0.456, 0.612],
  turfAerosolCan: [0.443, 0.69, 0.443],
  turfPaintBucket: [1.358, 1.35, 1.439],
  turfFinishGantry: [7.7, 7.361, 2.987],
  turfIslandTree: [9.569, 10, 9.182],
  turfIslandTower: [8.582, 12, 8.803],
  turfBalloon: [4.709, 7.5, 4.699],
  turfIslandPaintPot: [9.296, 10, 9.665],
  turfIslandPalette: [8.113, 10, 7.804],
  turfIslandEasel: [9.803, 12, 10.063]
} as const satisfies Record<string, readonly [number, number, number]>;

/** Paint-bucket colour variants (roadside props); one GLB per colour instead of a runtime recolour of baked paint. */
export const PAINT_BUCKET_KEYS = ["turfPaintBucketMagenta", "turfPaintBucketAmber", "turfPaintBucketCyan", "turfPaintBucketViolet"] as const;
export type PaintBucketKey = (typeof PAINT_BUCKET_KEYS)[number];
export const PAINT_BUCKET_NODE_IDS = PAINT_BUCKET_KEYS.map((k) => `props-${k}`);

/**
 * Every Idol GLB the game mounts, as typed refs from the route-scoped asset module (`aura3d assets typegen --route
 * apps/showcase-splat-turf` scans these member accesses), so the bundle never pulls in the repo-wide catalogue.
 */
export const TURF_IDOL_ASSETS = {
  turfHeroKartShell: assets.turfHeroKartShell,
  turfRivalKartShell: assets.turfRivalKartShell,
  turfKartWheel: assets.turfKartWheel,
  turfScrubBrush: assets.turfScrubBrush,
  turfHeroDriverRig: assets.turfHeroDriverRig,
  turfRivalDriverRig: assets.turfRivalDriverRig,
  turfAerosolCan: assets.turfAerosolCan,
  turfPaintBucketMagenta: assets.turfPaintBucketMagenta,
  turfPaintBucketAmber: assets.turfPaintBucketAmber,
  turfPaintBucketCyan: assets.turfPaintBucketCyan,
  turfPaintBucketViolet: assets.turfPaintBucketViolet,
  turfBleacher: assets.turfBleacher,
  turfTrussTower: assets.turfTrussTower,
  turfAerosolMonument: assets.turfAerosolMonument,
  turfInflatableBarrier: assets.turfInflatableBarrier,
  turfStreetPalm: assets.turfStreetPalm,
  turfInkTank: assets.turfInkTank,
  turfFinishGantry: assets.turfFinishGantry,
  turfIslandTree: assets.turfIslandTree,
  turfIslandTower: assets.turfIslandTower,
  turfBalloon: assets.turfBalloon,
  turfIslandPaintPot: assets.turfIslandPaintPot,
  turfIslandPalette: assets.turfIslandPalette,
  turfIslandEasel: assets.turfIslandEasel
} as const;

/** Every Idol asset key the game mounts (art-direction contract + tests). */
export const TURF_IDOL_KEYS = Object.keys(TURF_IDOL_ASSETS) as (keyof typeof TURF_IDOL_ASSETS)[];

const PARK_Y = -60;

/**
 * Pooled instanced GLB: `place`/`collapse` per pool slot like `runner-kit` `Batch`, `flush` writes only the live slots
 * contiguously (`setInstanceMatrices(…, count)`) so parked slots never cost vertex work. Transform is `T · Ry(yaw) · Rx(pitch) · Rz(roll) · S`.
 */
export class IdolPool {
  private readonly live: Uint8Array;
  private readonly pose: Float32Array;
  private readonly tint: Float32Array;
  private readonly matrices: Float32Array;
  private readonly rgba: Float32Array;
  private dirty = true;
  /** Frame offset baked into every matrix: the dense-matrix path ignores the node's own position (see `flush`). */
  private ox = 0;
  private oy = 0;
  private oz = 0;

  constructor(readonly capacity: number) {
    this.live = new Uint8Array(capacity);
    this.pose = new Float32Array(capacity * 9);
    this.tint = new Float32Array(capacity * 3).fill(1);
    this.matrices = new Float32Array(capacity * 16);
    this.rgba = new Float32Array(capacity * 4).fill(1);
  }

  place(i: number, x: number, y: number, z: number, yaw: number, scale = 1, pitch = 0, roll = 0, sy = scale): void {
    if (i < 0 || i >= this.capacity) return;
    const o = i * 9, p = this.pose;
    if (this.live[i] === 1 && p[o] === x && p[o + 1] === y && p[o + 2] === z && p[o + 3] === yaw && p[o + 4] === scale && p[o + 5] === pitch && p[o + 6] === roll && p[o + 7] === sy) return;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = yaw; p[o + 4] = scale; p[o + 5] = pitch; p[o + 6] = roll; p[o + 7] = sy;
    this.live[i] = 1;
    this.dirty = true;
  }

  collapse(i: number): void {
    if (i < 0 || i >= this.capacity || this.live[i] === 0) return;
    this.live[i] = 0;
    this.dirty = true;
  }

  setTint(i: number, rgb: Rgb): void {
    if (i < 0 || i >= this.capacity) return;
    const o = i * 3;
    if (this.tint[o] === rgb[0] && this.tint[o + 1] === rgb[1] && this.tint[o + 2] === rgb[2]) return;
    this.tint[o] = rgb[0]; this.tint[o + 1] = rgb[1]; this.tint[o + 2] = rgb[2];
    if (this.live[i] === 1) this.dirty = true;
  }

  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) n += this.live[i]!;
    return n;
  }

  /**
   * Upload the live instances (one parked instance when none is live, so the instanced node never goes empty).
   * `offset` is the scrolling road frame (`[0, 0, roadZ]`): the engine's `setInstanceMatrices` path draws the dense
   * matrices with an identity node transform, so `node.setPosition(...)` on the pool node is ignored and the frame offset
   * has to be in the matrices themselves (without it every pickup stayed parked far down the road: invisible).
   */
  flush(handle: NodeHandle, force = false, offset: readonly [number, number, number] = [0, 0, 0]): void {
    if (offset[0] !== this.ox || offset[1] !== this.oy || offset[2] !== this.oz) {
      this.ox = offset[0]; this.oy = offset[1]; this.oz = offset[2];
      this.dirty = true;
    }
    if (!this.dirty && !force) return;
    this.dirty = false;
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.live[i] !== 1) continue;
      const o = i * 9, p = this.pose;
      writePose(this.matrices, n, p[o]! + this.ox, p[o + 1]! + this.oy, p[o + 2]! + this.oz, p[o + 3]!, p[o + 5]!, p[o + 6]!, p[o + 4]!, p[o + 7]!);
      this.rgba.set([this.tint[i * 3]!, this.tint[i * 3 + 1]!, this.tint[i * 3 + 2]!, 1], n * 4);
      n++;
    }
    if (n === 0) {
      writePose(this.matrices, 0, 0, PARK_Y, 0, 0, 0, 0, 0.001, 0.001);
      this.rgba.set([1, 1, 1, 1], 0);
      n = 1;
    }
    handle.setInstanceMatrices?.(this.matrices, n, this.rgba);
  }
}

/** Column-major `T · Ry(yaw) · Rx(pitch) · Rz(roll) · S(s, sy, s)` into slot `n`. */
function writePose(m: Float32Array, n: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, s: number, sy: number): void {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), syw = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const o = n * 16;
  m[o] = (cy * cr + syw * sp * sr) * s; m[o + 1] = cp * sr * s; m[o + 2] = (-syw * cr + cy * sp * sr) * s; m[o + 3] = 0;
  m[o + 4] = (-cy * sr + syw * sp * cr) * sy; m[o + 5] = cp * cr * sy; m[o + 6] = (syw * sr + cy * sp * cr) * sy; m[o + 7] = 0;
  m[o + 8] = syw * cp * s; m[o + 9] = -sp * s; m[o + 10] = cy * cp * s; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
}

const parked = (capacity: number) =>
  Array.from({ length: capacity }, () => ({ position: [0, PARK_Y, 0] as const, scale: 0.001 }));

/** One pooled instanced Idol GLB node (`runtime id = id`), parked until the first `IdolPool.flush`. */
export function idolInstancedNode(id: string, asset: ModelRef, capacity: number, shadow: { cast?: boolean; receive?: boolean } = {}) {
  return instances
    .model(asset, {
      name: id,
      scaleMode: "world",
      transforms: parked(capacity),
      colors: Array.from({ length: capacity }, () => "#ffffff"),
      castShadow: shadow.cast ?? false,
      receiveShadow: shadow.receive ?? false
    })
    .runtime({ id });
}

/* ------------------------------------------------------------------ hero rover */

/**
 * Hero ink rover: the Idol kid-driven street kart sits behind the 0.45 m wet-ink roller ball (ball-local frame: ball centre at
 * the origin, road at y = -0.45, travel along -Z). The procedural brass roller yoke and caps still clamp the ball and reach
 * back into the kart's nose, so the paint roller remains the custom-shader ball.
 */
export const HERO_ROVER_OFFSET = { y: -0.45, z: 0.48 + IDOL_DIMS.turfHeroKartShell[2] / 2 } as const;
/** The kart body's transform inside the `ink-rover-body` group (ball-local frame; the GLB faces +Z, the kart drives -Z). */
export const HERO_BODY_LOCAL: Mat4 = trs([0, HERO_ROVER_OFFSET.y, HERO_ROVER_OFFSET.z], [0, Math.PI, 0]);

/**
 * Wheel hubs measured on the wheel-less Idol bodies (GLB frame, front pair first): arch centres from the side-skin
 * profile of each GLB (`artifacts/idol/splat-turf/<key>/views.png` side view), tyre tops tucked under the arch crowns,
 * outer faces flush with the body sides, touching the ground (hub y = radius).
 */
const hubs = (x: number, r: number, zf: number, zr: number): readonly (readonly [number, number, number])[] =>
  [[-x, r, zf], [x, r, zf], [-x, r, zr], [x, r, zr]];
export const HERO_KART_LAYOUT: KartLayout = { wheelRadius: 0.14, wheelWidth: 0.13, hubs: hubs(0.54, 0.14, 0.45, -0.2) };
/** Rival arches from the outer-skin profile: front z 0.14..0.38 (crown 0.33 m), rear z -0.55..-0.37 (crown 0.37 m). */
export const RIVAL_KART_LAYOUT: KartLayout = { wheelRadius: 0.135, wheelWidth: 0.12, hubs: hubs(0.36, 0.135, 0.26, -0.46) };
/** Rival scrub brush: across the front bumper, axle along X, bristles just clearing the road. */
export const RIVAL_BRUSH_LOCAL = { y: IDOL_DIMS.turfScrubBrush[1] / 2 + 0.01, z: IDOL_DIMS.turfRivalKartShell[2] / 2 + IDOL_DIMS.turfScrubBrush[2] * 0.35 } as const;

/** Rigged drivers are stored at unit height; `normalized.sceneScale` from `<key>.idol.json` sizes them (generator rule). */
export const DRIVER_RIG_SCALE = { turfHeroDriverRig: 1.151, turfRivalDriverRig: 1.001 } as const;
/** Seat points (where the seated hips go) in each shell's GLB frame, measured on the empty-seat shells. */
export const HERO_SEAT: readonly [number, number, number] = [0, 0.34, -0.18];
export const RIVAL_SEAT: readonly [number, number, number] = [0, 0.33, -0.32];
export const HERO_DRIVER_ID = "hero-driver";
export const rivalDriverId = (i: number): string => `rival-driver-${i}`;

/** One rival driver node per bot slot (top level; world.ts moves, hides and poses it with its kart every frame). */
export function rivalDriverNodes(count: number) {
  return Array.from({ length: count }, (_, i) =>
    model(TURF_IDOL_ASSETS.turfRivalDriverRig, { name: rivalDriverId(i), scaleMode: "world", castShadow: true, receiveShadow: true, scale: DRIVER_RIG_SCALE.turfRivalDriverRig, visible: false })
      .position(0, -60, 0)
      .runtime({ id: rivalDriverId(i) })
  );
}

export function heroRoverNode() {
  // Aura3D 5.7.0 parent-local nested driver rig: `hero-driver` sits directly inside `ink-rover-body`
  // so it inherits kart roll, pitch, and scale in lockstep with zero matrix lag.
  return group("ink-rover-body", [
    model(TURF_IDOL_ASSETS.turfHeroKartShell, { name: "ink-rover-idol", scaleMode: "world", castShadow: true, receiveShadow: true })
      .position(0, HERO_ROVER_OFFSET.y, HERO_ROVER_OFFSET.z)
      .rotation(0, Math.PI, 0),
    model(TURF_IDOL_ASSETS.turfHeroDriverRig, { name: HERO_DRIVER_ID, scaleMode: "world", castShadow: true, receiveShadow: true, scale: DRIVER_RIG_SCALE.turfHeroDriverRig, visible: false })
      .position(0, HERO_ROVER_OFFSET.y, HERO_ROVER_OFFSET.z)
      .rotation(0, Math.PI, 0)
      .runtime({ id: HERO_DRIVER_ID })
  ]).runtime({ id: "ink-rover-body" });
}

/** Legacy standalone hero driver helper (retained for compatibility; `heroRoverNode()` now nests `HERO_DRIVER_ID`). */
export function heroDriverNode() {
  return model(TURF_IDOL_ASSETS.turfHeroDriverRig, { name: HERO_DRIVER_ID, scaleMode: "world", castShadow: true, receiveShadow: true, scale: DRIVER_RIG_SCALE.turfHeroDriverRig, visible: false })
    .position(0, -60, 0)
    .runtime({ id: HERO_DRIVER_ID });
}

/* ------------------------------------------------------------------ finish gantry */

/**
 * Gantry span. Measured on the GLB, the truss feet start at 58.5% of the half-width (inner face |x| = 0.585 * W / 2), so
 * the former 9.4 m span left the feet at ±2.75 m: inside the deck, where the rover (|x| up to 3.11 m) parked in them at
 * the finish. 12.6 m puts the feet at ±3.69 m, outside the curbs (±3.52 m). Height and depth keep the 9.4 m look
 * (`FINISH_GANTRY_SCALE` stretches x only); pinned by tests/unit/splat-turf/collision-footprints.test.ts.
 */
export const FINISH_GANTRY_WIDTH = 12.6;
const FINISH_GANTRY_BODY_SCALE = 9.4 / IDOL_DIMS.turfFinishGantry[0];
export const FINISH_GANTRY_SCALE: readonly [number, number, number] = [
  FINISH_GANTRY_WIDTH / IDOL_DIMS.turfFinishGantry[0],
  FINISH_GANTRY_BODY_SCALE,
  FINISH_GANTRY_BODY_SCALE
];

/** Finish-line scoreboard gantry (runtime id `finish`, moved to `roadZ - RUN_LENGTH` every frame by world.ts). */
export function finishGantryNode() {
  return group("finish", [
    model(TURF_IDOL_ASSETS.turfFinishGantry, { name: "finish-gantry-idol", scaleMode: "world", castShadow: true, receiveShadow: true })
      .scale([FINISH_GANTRY_SCALE[0], FINISH_GANTRY_SCALE[1], FINISH_GANTRY_SCALE[2]])
  ]).runtime({ id: "finish" });
}

/* ------------------------------------------------------------------ arena sideline belt */

export const ARENA_BELT_SPAN = 96;

type ArenaKey = "turfBleacher" | "turfTrussTower" | "turfAerosolMonument" | "turfInflatableBarrier" | "turfStreetPalm" | "turfInkTank";

/** Sideline anchors of one 96 m belt tile (same slots, sides and setbacks as the former procedural belt). */
export const ARENA_LAYOUT: readonly { readonly key: ArenaKey; readonly side: -1 | 1; readonly x: number; readonly z: number; readonly yaw?: number }[] = [
  { key: "turfInkTank", side: -1, x: 10.6, z: -10 },
  { key: "turfInkTank", side: 1, x: 10.6, z: -58 },
  { key: "turfInkTank", side: 1, x: 10.8, z: -14 },
  { key: "turfInkTank", side: -1, x: 10.8, z: -62 },
  { key: "turfBleacher", side: -1, x: 13.8, z: -28 },
  { key: "turfBleacher", side: 1, x: 13.8, z: -32 },
  { key: "turfBleacher", side: -1, x: 13.8, z: -78 },
  { key: "turfBleacher", side: 1, x: 13.8, z: -82 },
  { key: "turfTrussTower", side: -1, x: 11.2, z: -44 },
  { key: "turfTrussTower", side: 1, x: 11.2, z: -46 },
  { key: "turfTrussTower", side: -1, x: 11.2, z: -92 },
  { key: "turfTrussTower", side: 1, x: 11.2, z: -94 },
  { key: "turfAerosolMonument", side: 1, x: 11.6, z: -22, yaw: 0.18 },
  { key: "turfAerosolMonument", side: -1, x: 11.6, z: -70, yaw: -0.18 },
  { key: "turfInflatableBarrier", side: -1, x: 9.2, z: -18 },
  { key: "turfInflatableBarrier", side: 1, x: 9.2, z: -26 },
  { key: "turfInflatableBarrier", side: -1, x: 9.2, z: -52 },
  { key: "turfInflatableBarrier", side: 1, x: 9.2, z: -68 },
  ...Array.from({ length: 6 }, (_, p) => ({ key: "turfStreetPalm" as const, side: (p % 2 === 0 ? -1 : 1) as -1 | 1, x: 9.8, z: -6 - p * 15.5, yaw: p * 1.3 }))
];

const ARENA_KEYS: readonly ArenaKey[] = ["turfInkTank", "turfBleacher", "turfTrussTower", "turfAerosolMonument", "turfInflatableBarrier", "turfStreetPalm"];

export interface ArenaBeltNode {
  readonly id: string;
  readonly key: ArenaKey;
  readonly node: ReturnType<typeof instances.model>;
}

/**
 * Two seamless 96 m sideline tiles per set piece kind, baked into one static `instances.model` node each (tile 1 sits at
 * `z - 96`); scenery.ts moves every node to the same scrolling belt z. GLBs face +Z, so a piece faces the road with
 * yaw +90 deg on the left (side -1) and -90 deg on the right.
 */
export function createArenaBeltNodes(): readonly ArenaBeltNode[] {
  return ARENA_KEYS.map((key) => {
    const transforms = [];
    for (let tile = 0; tile < 2; tile++) {
      for (const a of ARENA_LAYOUT) {
        if (a.key !== key) continue;
        transforms.push({
          position: [a.side * a.x, -0.35, a.z - tile * ARENA_BELT_SPAN] as const,
          rotation: [0, (a.side === -1 ? Math.PI / 2 : -Math.PI / 2) + (a.yaw ?? 0), 0] as const,
          scale: 1
        });
      }
    }
    const id = `arena-${key}`;
    return {
      id,
      key,
      node: instances.model(TURF_IDOL_ASSETS[key], { name: id, scaleMode: "world", transforms, castShadow: false, receiveShadow: true }).runtime({ id })
    };
  });
}

/* ------------------------------------------------------------------ sky islands */

const ISLAND_ASSET: Record<TurfBackdropKind, ModelRef> = {
  balloon: TURF_IDOL_ASSETS.turfBalloon,
  easelIsland: TURF_IDOL_ASSETS.turfIslandEasel,
  islandTower: TURF_IDOL_ASSETS.turfIslandTower,
  islandTree: TURF_IDOL_ASSETS.turfIslandTree,
  paintPotIsland: TURF_IDOL_ASSETS.turfIslandPaintPot,
  paletteIsland: TURF_IDOL_ASSETS.turfIslandPalette
};
const ISLAND_DIMS: Record<TurfBackdropKind, readonly [number, number, number]> = {
  balloon: IDOL_DIMS.turfBalloon,
  easelIsland: IDOL_DIMS.turfIslandEasel,
  islandTower: IDOL_DIMS.turfIslandTower,
  islandTree: IDOL_DIMS.turfIslandTree,
  paintPotIsland: IDOL_DIMS.turfIslandPaintPot,
  paletteIsland: IDOL_DIMS.turfIslandPalette
};
/** Largest extent of the former procedural island specs at instance scale 1 (keeps every island's on-screen size). */
const PROCEDURAL_MAX_DIM: Record<TurfBackdropKind, number> = {
  balloon: 5.0, easelIsland: 13.2, islandTower: 16.6, islandTree: 14.7, paintPotIsland: 12.9, paletteIsland: 11.9
};
/** Fraction of the GLB height below the deck / balloon centre (`p.y` was the procedural deck top or envelope centre). */
const ISLAND_ANCHOR: Record<TurfBackdropKind, number> = {
  balloon: 0.45, easelIsland: 0.45, islandTower: 0.4, islandTree: 0.5, paintPotIsland: 0.55, paletteIsland: 0.55
};

export interface IslandNode {
  readonly nodeId: string;
  readonly kind: TurfBackdropKind;
  readonly phase: number;
  readonly node: ReturnType<typeof instances.model>;
}

/** Sky islands and balloons as one static instanced Idol GLB node per kind (two 190 m tiles; scenery.ts scrolls and bobs them). */
export function createIdolIslandNodes(pieces: readonly TurfBackdropPiece[], kinds: readonly TurfBackdropKind[], span: number, near: number): readonly IslandNode[] {
  const out: IslandNode[] = [];
  kinds.forEach((kind, kIdx) => {
    const groupPieces = pieces.filter((p) => p.kind === kind);
    if (groupPieces.length === 0) return;
    const dims = ISLAND_DIMS[kind];
    const glbMax = Math.max(dims[0], dims[1], dims[2]);
    const transforms = [];
    for (let tile = 0; tile < 2; tile++) {
      for (const p of groupPieces) {
        const s = (PROCEDURAL_MAX_DIM[kind] * (p.size / 10.5)) / glbMax;
        // Widen hot-air balloon lateral clearance so balloons never clip the viewport margin on 1280x720 or 390x844.
        const lateral = kind === "balloon" ? Math.max(23.5, p.offset + 6.5) : p.offset;
        transforms.push({
          position: [p.side * lateral, p.y - ISLAND_ANCHOR[kind] * dims[1] * s, near - p.z0 - tile * span] as const,
          rotation: [0, p.z0 * 0.45, 0] as const,
          scale: s
        });
      }
    }
    const nodeId = `isle-group-${kind}`;
    out.push({
      nodeId,
      kind,
      phase: kIdx * 1.15,
      node: instances.model(ISLAND_ASSET[kind], { name: nodeId, scaleMode: "world", transforms, castShadow: false, receiveShadow: false }).runtime({ id: nodeId })
    });
  });
  return out;
}
