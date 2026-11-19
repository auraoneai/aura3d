/**
 * Scene colliders (owner QA 2026-11-18: the keeper must bump into what she can see, not walk through it).
 *
 * The sim's own colliders (`sim.ts` CIRCLES + RAILS) reproduce the original capture: the world edge, the cliff line,
 * the three structures, the oak and the sprite fences. The port draws more solid scenery than the original had
 * colliders for — every meadow tree trunk, the larger rocks, signposts, villagers, lantern posts, the shrine, standing
 * stones, the full-length model fence bays and the dry-stone walls behind them, the packhorse bridge's parapets and the
 * Idol cottages' wider walls. This module turns each of those footprints into a closed rail polyline that the sim's
 * sub-stepped wall slide (`slideAlongRails`) resolves exactly like the original rails, so the original's routes keep
 * their trajectory (tests/unit/where-the-wind-wanders-port/pass-through.test.ts replays the reference run with them).
 *
 * Pure: no engine imports, so the sim tests can build the same colliders the page uses.
 */
import { RAILS, STRUCTURES, type Vec2 } from "./sim";
import type { Scenery } from "./scenery";
import {
  BRIDGE_PARAPET_INSET, BRIDGE_SPOT, COTTAGE_LAYOUT, COTTAGE_WALLS, DRYSTONE_HALF_DEPTH, DRYSTONE_WALLS, EXTRA_STANDING_STONE,
  FENCE_BAYS, FENCE_BAY_HALF, IDOL_COTTAGE_PLANS, IDOL_COTTAGE_WALL_SHARE, JETTY_LANTERN, LANTERN_R, PATH_LANTERNS, SHRINE_R,
  SHRINE_SPOT, STANDING_STONE_R, VILLAGER_R, VILLAGER_SPOTS
} from "./decor-layout";

export type SolidKind = "trunk" | "rock" | "sign" | "villager" | "lantern" | "shrine" | "stone";
export interface SolidCircle { readonly x: number; readonly z: number; readonly r: number; readonly kind: SolidKind }
export interface SolidBox { readonly x: number; readonly z: number; readonly hx: number; readonly hz: number; readonly yaw: number; readonly kind: "cottage" | "wall" | "stairs" }
export interface SolidLine { readonly a: Vec2; readonly b: Vec2; readonly kind: "fence" | "parapet" }
export interface SceneColliders {
  readonly circles: readonly SolidCircle[];
  readonly boxes: readonly SolidBox[];
  readonly lines: readonly SolidLine[];
  /** The sim's RAILS followed by every collider above as a rail polyline: pass to `stepFrame(..., rails)`. */
  readonly rails: readonly (readonly Vec2[])[];
}

/** Closed polygon that contains the circle (vertices at r / cos(pi / seg)), so the slide keeps the player outside it. */
export function circleRail(x: number, z: number, r: number, seg = 10): Vec2[] {
  const R = r / Math.cos(Math.PI / seg);
  return Array.from({ length: seg + 1 }, (_, i) => {
    const a = ((i % seg) / seg) * Math.PI * 2;
    return { x: x + Math.cos(a) * R, z: z + Math.sin(a) * R };
  });
}

/** Closed rectangle (half extents hx along local x, hz along local z, yawed like the scenery's `rotate`). */
export function boxRail(b: Pick<SolidBox, "x" | "z" | "hx" | "hz" | "yaw">): Vec2[] {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const).map(([u, v]) => {
    const lx = u * b.hx, lz = v * b.hz;
    return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c };
  });
}

export interface ColliderOptions {
  /** The model set mounted the cottages/windmill set (villagers, lantern posts, shrine, fence bays, walls, bridge). */
  readonly modelSet: boolean;
  /** Standing stones are mounted. */
  readonly stones: boolean;
  /** Idol GLBs replace the procedural cottages and windmill (`IDOL_MODELS`). */
  readonly idol: boolean;
}

export function buildSceneColliders(sc: Pick<Scenery, "solids" | "placements">, opts: ColliderOptions): SceneColliders {
  const circles: SolidCircle[] = sc.solids.map((s) => ({ ...s }));
  const boxes: SolidBox[] = [];
  const lines: SolidLine[] = [];
  if (opts.modelSet) {
    for (const v of VILLAGER_SPOTS) circles.push({ x: v.x, z: v.z, r: VILLAGER_R, kind: "villager" });
    for (const [x, z] of [...PATH_LANTERNS, JETTY_LANTERN]) circles.push({ x, z, r: LANTERN_R, kind: "lantern" });
    circles.push({ x: SHRINE_SPOT[0], z: SHRINE_SPOT[1], r: SHRINE_R, kind: "shrine" });
    for (const f of FENCE_BAYS) lines.push({ a: { x: f.x - FENCE_BAY_HALF * f.scale, z: f.z }, b: { x: f.x + FENCE_BAY_HALF * f.scale, z: f.z }, kind: "fence" });
    for (const w of DRYSTONE_WALLS) boxes.push({ x: w.x, z: w.z, hx: w.length / 2, hz: DRYSTONE_HALF_DEPTH, yaw: 0, kind: "wall" });
    // the bridge spans the stream along its local x; its parapets run the full span on both sides of the deck
    const c = Math.cos(BRIDGE_SPOT.yaw), s = Math.sin(BRIDGE_SPOT.yaw);
    const half = BRIDGE_SPOT.length / 2, side = BRIDGE_SPOT.width / 2 - BRIDGE_PARAPET_INSET;
    const at = (lx: number, lz: number): Vec2 => ({ x: BRIDGE_SPOT.x + lx * c + lz * s, z: BRIDGE_SPOT.z - lx * s + lz * c });
    for (const v of [-side, side]) lines.push({ a: at(-half, v), b: at(half, v), kind: "parapet" });
  }
  COTTAGE_LAYOUT.forEach((k, i) => {
    const plan = IDOL_COTTAGE_PLANS[i % 2]!;
    const [hx, hz] = opts.modelSet && opts.idol
      ? [(plan[0] * k.s * IDOL_COTTAGE_WALL_SHARE) / 2, (plan[1] * k.s * IDOL_COTTAGE_WALL_SHARE) / 2]
      : [(COTTAGE_WALLS[0] * k.s) / 2, (COTTAGE_WALLS[1] * k.s) / 2];
    boxes.push({ x: k.x, z: k.z, hx, hz, yaw: k.yaw, kind: "cottage" });
  });
  if (!(opts.modelSet && opts.idol)) {
    // the procedural windmill's outside stair: its low end (below head height) is solid
    const m = STRUCTURES.windmill;
    boxes.push({ x: m.x + 6.75, z: m.z + 1.9, hx: 0.95, hz: 0.6, yaw: 0, kind: "stairs" });
  }
  if (opts.stones) {
    for (const p of sc.placements.stones) circles.push({ x: p.x, z: p.z, r: STANDING_STONE_R * p.s, kind: "stone" });
    circles.push({ x: EXTRA_STANDING_STONE[0], z: EXTRA_STANDING_STONE[1], r: STANDING_STONE_R * EXTRA_STANDING_STONE[3], kind: "stone" });
  }
  const rails: (readonly Vec2[])[] = [...RAILS];
  for (const c of circles) rails.push(circleRail(c.x, c.z, c.r));
  for (const b of boxes) rails.push(boxRail(b));
  for (const l of lines) rails.push([l.a, l.b]);
  return { circles, boxes, lines, rails };
}
