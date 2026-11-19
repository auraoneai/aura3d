/**
 * Solid courtside furniture that stands inside the area athletes and the ball can reach: the hoop stanchion (pad, post and
 * arm), the scorer's table, the ball cart and Shanghai's neon lamp masts. The drawn models (art/proceduralModels.ts,
 * idolBodies.ts) read their placements from here, so a collider can never drift from what is on screen.
 *
 * Two kinds of collider come out of one description:
 *  - floor-plane obstacles (circles and capsules) that athlete separation pushes bodies out of (rules.ts `separate`);
 *  - ball colliders (yawed boxes and spheres) for the swept shot world (shotPhysics.ts `createHoopWorld`).
 */
import type { createImpactWorld } from "@aura3d/engine/game";
import { catmullRomSpline3 } from "@aura3d/engine/sculpt";

export type BallCollider = Parameters<typeof createImpactWorld>[0]["colliders"][number];
type V3 = [number, number, number];

/* ------------------------------------------------------------------ *
 *  Drawn placements (shared with the art)                             *
 * ------------------------------------------------------------------ */

/** Hoop stanchion base on the floor (x, z). The rim is at the origin; the post stands 1.68 m behind it. */
export const STANCHION_BASE: readonly [number, number] = [0, -1.68];
/** Foam pad around the lower post: half extents in x / z and its top height (m). */
export const STANCHION_PAD = { rx: 0.22, rz: 0.24, top: 1.92 } as const;
/** Floor gusset plate under the post: half extents in x / z (m). */
export const STANCHION_PLATE_HALF: readonly [number, number] = [0.53, 0.56];
/** Post + gooseneck arm centreline in stanchion-local space (x, y, z); z grows toward the backboard. */
export const STANCHION_NECK: readonly V3[] = [
  [0, 0.06, 0],
  [0, 1.45, 0],
  [0, 2.52, 0.06],
  [0, 3.16, 0.48],
  [0, 3.38, 0.98],
  [0, 3.4, 1.24]
];
export const STANCHION_NECK_R = 0.105;
/** The two diagonal arm struts (right strut; the left one mirrors x). */
export const STANCHION_STRUT: readonly V3[] = [[0.14, 2.48, 0.08], [0.28, 3.04, 0.62], [0.44, 3.52, 1.24]];
export const STANCHION_STRUT_R = 0.036;

/** Scorer's table: centre on the floor, yaw, half width (local x) / half depth (local z) and top height. */
export const SCORER_TABLE = { x: 9.2, z: -3.4, yaw: -0.8, halfW: 0.96, halfD: 0.49, height: 0.78 } as const;
/** Chrome ball cart: centre, yaw, frame half width / half depth (W, D in the model) and top rail height. */
export const BALL_CART = { x: -8.9, z: 9.4, yaw: 0.5, halfW: 0.62, halfD: 0.27, height: 1.08 } as const;
/** Shanghai neon lamp masts (x, z): base lathe radius, mast tube radius and mast height. */
export const SHANGHAI_LAMP_SPOTS: readonly (readonly [number, number])[] = [[-9, -3.2], [9, -3.2], [-9, 11.5], [9, 11.5], [-12, 4], [12, 4]];
export const SHANGHAI_LAMP = { baseR: 0.22, baseH: 0.34, mastR: 0.062, height: 4.58 } as const;

/* ------------------------------------------------------------------ *
 *  Floor-plane obstacles for athletes                                 *
 * ------------------------------------------------------------------ */

/** A floor-plane obstacle: the segment a-b swept by radius `r` (a circle when a == b). */
export interface Obstacle {
  readonly id: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly r: number;
}

/** Where athletes can stand: main.ts clamps every body to these (COURT_X + 1.4, COURT_Z0 - 2.4, COURT_Z1 + 2.6). */
export interface Bounds { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
export function playerBounds(courtX: number, courtZ0: number, courtZ1: number): Bounds {
  return { x0: -courtX - 1.4, x1: courtX + 1.4, z0: courtZ0 - 2.4, z1: courtZ1 + 2.6 };
}
/** The Aura Hoops court (COURT_X 7.6, COURT_Z0 -2.2, COURT_Z1 10.6). */
export const HOOPS_PLAYER_BOUNDS: Bounds = playerBounds(7.6, -2.2, 10.6);

const circle = (id: string, x: number, z: number, r: number): Obstacle => ({ id, ax: x, az: z, bx: x, bz: z, r });
/** A yawed rectangle (half width along local x, half depth along local z) as a capsule that covers all four corners. */
function rectCapsule(id: string, x: number, z: number, yaw: number, halfW: number, halfD: number): Obstacle {
  // spine along the long axis, inset so the rounded ends stay close to the short edges
  const half = Math.max(0, halfW - halfD * 0.45);
  const r = Math.hypot(halfW - half, halfD);
  const ux = Math.cos(yaw), uz = -Math.sin(yaw); // local +x in world (rotation about Y)
  return { id, ax: x - ux * half, az: z - uz * half, bx: x + ux * half, bz: z + uz * half, r };
}

/** Obstacles every court has: the stanchion (pad and floor plate), the scorer's table and the ball cart. */
export const COMMON_OBSTACLES: readonly Obstacle[] = [
  circle("stanchion", STANCHION_BASE[0], STANCHION_BASE[1], Math.max(STANCHION_PLATE_HALF[0], STANCHION_PLATE_HALF[1])),
  rectCapsule("scorer-table", SCORER_TABLE.x, SCORER_TABLE.z, SCORER_TABLE.yaw, SCORER_TABLE.halfW, SCORER_TABLE.halfD),
  rectCapsule("ball-cart", BALL_CART.x, BALL_CART.z, BALL_CART.yaw, BALL_CART.halfW + 0.02, BALL_CART.halfD + 0.02)
];

/** The obstacles on one court (Shanghai adds its lamp masts, four of which stand on the sidelines). */
export function courtObstacles(courtId: string): readonly Obstacle[] {
  if (courtId !== "shanghai") return COMMON_OBSTACLES;
  return [...COMMON_OBSTACLES, ...SHANGHAI_LAMP_SPOTS.map(([x, z], i) => circle(`shanghai-lamp-${i}`, x, z, SHANGHAI_LAMP.baseR))];
}

/** Closest point on the obstacle spine to (px, pz). */
function spinePoint(o: Obstacle, px: number, pz: number): [number, number] {
  const dx = o.bx - o.ax, dz = o.bz - o.az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - o.ax) * dx + (pz - o.az) * dz) / l2)) : 0;
  return [o.ax + dx * t, o.az + dz * t];
}

/** Distance from (px, pz) to the obstacle surface (negative inside). */
export function obstacleClearance(o: Obstacle, px: number, pz: number): number {
  const [sx, sz] = spinePoint(o, px, pz);
  return Math.hypot(px - sx, pz - sz) - o.r;
}

/** True when a body of radius `bodyR` centred at (px, pz) overlaps the obstacle. */
export function bodyInsideObstacle(o: Obstacle, px: number, pz: number, bodyR: number): boolean {
  return obstacleClearance(o, px, pz) < bodyR - 1e-6;
}

const inBounds = (b: Bounds | undefined, x: number, z: number): boolean => !b || (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const RING_DIRS = 32;

/**
 * Moves `p` out of every obstacle (a body of radius `bodyR`), staying inside `bounds`. Pushes go along the obstacle normal;
 * where a bound and an obstacle leave no room (a corner pocket), the body goes to the nearest free spot on rings around
 * it. Deterministic, no randomness. Returns true when `p` moved.
 */
export function resolveObstacles(p: { x: number; z: number }, obstacles: readonly Obstacle[], bodyR: number, bounds?: Bounds): boolean {
  if (obstacles.length === 0) return false;
  const x0 = p.x, z0 = p.z;
  const insideAny = (x: number, z: number): boolean => obstacles.some((o) => bodyInsideObstacle(o, x, z, bodyR));
  if (!insideAny(p.x, p.z)) return false;
  for (let iter = 0; iter < 4; iter++) {
    for (const o of obstacles) {
      const [sx, sz] = spinePoint(o, p.x, p.z);
      let dx = p.x - sx, dz = p.z - sz;
      let d = Math.hypot(dx, dz);
      const need = o.r + bodyR;
      if (d >= need) continue;
      if (d < 1e-6) {
        // dead centre on the spine: leave toward the court centre line (x = 0, z = 4)
        dx = -sx; dz = 4 - sz; d = Math.hypot(dx, dz) || 1;
      }
      p.x = sx + (dx / d) * need;
      p.z = sz + (dz / d) * need;
    }
    if (bounds) {
      p.x = Math.max(bounds.x0, Math.min(bounds.x1, p.x));
      p.z = Math.max(bounds.z0, Math.min(bounds.z1, p.z));
    }
    if (!insideAny(p.x, p.z)) return true;
  }
  // corner pocket: nearest free point on growing rings around where the body was
  for (let ring = 1; ring <= 80; ring++) {
    const rr = ring * 0.04;
    for (let k = 0; k < RING_DIRS; k++) {
      const a = (k / RING_DIRS) * Math.PI * 2;
      const x = x0 + Math.cos(a) * rr, z = z0 + Math.sin(a) * rr;
      if (inBounds(bounds, x, z) && !insideAny(x, z)) { p.x = x; p.z = z; return true; }
    }
  }
  return p.x !== x0 || p.z !== z0;
}

/* ------------------------------------------------------------------ *
 *  Ball colliders                                                     *
 * ------------------------------------------------------------------ */

const STEEL = { restitution: 0.5, friction: 0.2 } as const;

/** Spheres of radius `r` along a polyline, spaced so the swept-ball surface between them dips by under ~1.5 cm. */
function sphereChain(idPrefix: string, pts: readonly (readonly [number, number, number])[], r: number, spacing: number, offset: V3, fromY = -Infinity): BallCollider[] {
  const out: BallCollider[] = [];
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const c: V3 = [a[0] + (b[0] - a[0]) * t + offset[0], a[1] + (b[1] - a[1]) * t + offset[1], a[2] + (b[2] - a[2]) * t + offset[2]];
      if (c[1] < fromY) continue;
      out.push({ kind: "sphere", id: `${idPrefix}-${n++}`, tag: "pole", radius: r, center: c, ...STEEL });
    }
  }
  return out;
}

/** The hoop stanchion as the ball sees it: pad box, post box above the pad, then the gooseneck arm and both struts as sphere chains. */
export function stanchionBallColliders(): BallCollider[] {
  const [sx, sz] = STANCHION_BASE;
  const at: V3 = [sx, 0, sz];
  const postTop = 2.52;
  return [
    { kind: "box", id: "pole-pad", tag: "pole", center: [sx, STANCHION_PAD.top / 2, sz], half: [STANCHION_PAD.rx, STANCHION_PAD.top / 2, STANCHION_PAD.rz], ...STEEL, restitution: 0.35 },
    { kind: "box", id: "pole-post", tag: "pole", center: [sx, (STANCHION_PAD.top + postTop) / 2, sz + 0.03], half: [STANCHION_NECK_R, (postTop - STANCHION_PAD.top) / 2, STANCHION_NECK_R + 0.03], ...STEEL },
    // the drawn neck follows a Catmull-Rom curve through its points (6 per span) and the struts are straight runs:
    // the chains follow the same paths
    ...sphereChain("pole-arm", catmullRomSpline3(STANCHION_NECK.map((p): V3 => [p[0], p[1], p[2]]), 6), STANCHION_NECK_R, 0.12, at, postTop - 0.05),
    ...sphereChain("pole-strut-r", STANCHION_STRUT, STANCHION_STRUT_R, 0.08, at),
    ...sphereChain("pole-strut-l", STANCHION_STRUT.map(([x, y, z]): V3 => [-x, y, z]), STANCHION_STRUT_R, 0.08, at)
  ];
}

/** Scorer's table and ball cart as yawed boxes (a loose ball bounces off them instead of rolling through). */
export function courtsideBallColliders(): BallCollider[] {
  return [
    { kind: "box", id: "scorer-table", tag: "decor", center: [SCORER_TABLE.x, SCORER_TABLE.height / 2, SCORER_TABLE.z], half: [SCORER_TABLE.halfW, SCORER_TABLE.height / 2, SCORER_TABLE.halfD], yaw: SCORER_TABLE.yaw, restitution: 0.3, friction: 0.3 },
    { kind: "box", id: "ball-cart", tag: "decor", center: [BALL_CART.x, BALL_CART.height / 2, BALL_CART.z], half: [BALL_CART.halfW + 0.02, BALL_CART.height / 2, BALL_CART.halfD + 0.02], yaw: BALL_CART.yaw, restitution: 0.35, friction: 0.3 }
  ];
}

/** Per-court ball colliders (Shanghai's lamp masts). Ids are prefixed `venue-` so a court swap can remove them. */
export function venueBallColliders(courtId: string): BallCollider[] {
  if (courtId !== "shanghai") return [];
  return SHANGHAI_LAMP_SPOTS.flatMap(([x, z], i): BallCollider[] => [
    { kind: "box", id: `venue-lamp-base-${i}`, tag: "pole", center: [x, SHANGHAI_LAMP.baseH / 2, z], half: [SHANGHAI_LAMP.baseR, SHANGHAI_LAMP.baseH / 2, SHANGHAI_LAMP.baseR], ...STEEL },
    { kind: "box", id: `venue-lamp-mast-${i}`, tag: "pole", center: [x, SHANGHAI_LAMP.height / 2, z], half: [SHANGHAI_LAMP.mastR, SHANGHAI_LAMP.height / 2, SHANGHAI_LAMP.mastR], ...STEEL }
  ]);
}

/* ------------------------------------------------------------------ *
 *  Decor footprints (for the pass-through audit)                      *
 * ------------------------------------------------------------------ */

/** A floor footprint of a solid decor piece as a circle (x, z, radius) and the obstacle id that guards it, if any. */
export interface DecorFootprint { readonly name: string; readonly courts: "all" | readonly string[]; readonly x: number; readonly z: number; readonly r: number; readonly collider?: string }

/**
 * Every solid piece placed near the court, with a bounding circle of its floor footprint. Pieces that reach into the
 * area a body can occupy (HOOPS_PLAYER_BOUNDS grown by a body radius) must name the obstacle that keeps bodies out.
 */
export const DECOR_FOOTPRINTS: readonly DecorFootprint[] = [
  { name: "hoop-stanchion", courts: "all", x: STANCHION_BASE[0], z: STANCHION_BASE[1], r: Math.max(STANCHION_PLATE_HALF[0], STANCHION_PLATE_HALF[1]), collider: "stanchion" },
  { name: "scorer-table", courts: "all", x: SCORER_TABLE.x, z: SCORER_TABLE.z, r: Math.hypot(SCORER_TABLE.halfW, SCORER_TABLE.halfD), collider: "scorer-table" },
  { name: "ball-cart", courts: "all", x: BALL_CART.x, z: BALL_CART.z, r: Math.hypot(BALL_CART.halfW, BALL_CART.halfD), collider: "ball-cart" },
  // team benches (0.46 m deep, 3.8 m long at x = +-10.4, z = 3.8) and their coolers (r 0.215 at z = 6.08)
  { name: "bench-w", courts: "all", x: -10.4, z: 3.8, r: 0.25 },
  { name: "bench-e", courts: "all", x: 10.4, z: 3.8, r: 0.25 },
  { name: "cooler-w", courts: "all", x: -10.4, z: 6.08, r: 0.215 },
  { name: "cooler-e", courts: "all", x: 10.4, z: 6.08, r: 0.215 },
  // Rucker floodlight towers (0.78 m base) and the Manila ?look=original floods
  ...([[-11, -7], [11, -7], [-11, 13], [11, 13]] as const).map(([x, z]) => ({ name: `rucker-flood-${x}-${z}`, courts: ["rucker"], x, z, r: 0.56 })),
  ...([[-13, -4], [13, -4], [-13, 12], [13, 12]] as const).map(([x, z]) => ({ name: `manila-flood-${x}-${z}`, courts: ["manila"], x, z, r: 0.56 })),
  // Shanghai neon lamp masts
  ...SHANGHAI_LAMP_SPOTS.map(([x, z], i) => ({ name: `shanghai-lamp-${i}`, courts: ["shanghai"], x, z, r: SHANGHAI_LAMP.baseR, collider: `shanghai-lamp-${i}` })),
  // Venice palms (trunk base ~0.21 m x scale)
  ...([[-12, -8, 1.0], [12.5, -10, 1.2], [-14, 12, 0.9], [14, 14, 1.05], [-9, 16, 0.82]] as const).map(([x, z, s]) => ({ name: `venice-palm-${x}-${z}`, courts: ["venice"], x, z, r: 0.21 * s }))
];
