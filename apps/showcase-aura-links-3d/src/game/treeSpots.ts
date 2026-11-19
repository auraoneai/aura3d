/**
 * Aura Links 3D: where the corridor trees stand, and the ball's colliders for them.
 *
 * The tree list was drawn inside the renderer (main.ts buildDressingNodes) from the hole scene's seeded rng, so the sim
 * could not see a tree and the ball flew and rolled through them. The spots are generated here instead (same rng seed and
 * draw order: the trees are the scene rng's first draws, so main.ts passes its rng and gets the identical list), main.ts
 * draws exactly this list, and `treeColliders` turns each drawn tree into a trunk + canopy collider measured from the
 * model it is drawn with:
 *  - Idol broadleaves (default look): the instance transform from `idolTreePlacement` (game/idolArt.ts, the one the
 *    renderer uses) applied to the GLB's measured trunk and canopy (vertex profile of assets/idol/*.glb after the GLB's
 *    own auraRoot normalisation, GLB metres before the instance scale).
 *  - Procedural trees (`buildCourseTreeBatches`, art/proceduralModels.ts; the conifers of the Idol look and every tree of
 *    `?look=original`): scale h / 6.3, base on the lowest ground under the roots, the trunk / oak canopy / pine canopy mesh dims.
 * Trees the shot camera clearance hides (treeClearance.ts) are drawn at zero scale, so they get no collider for that shot
 * (`visibleTreeColliders`). Pure (no engine imports): unit tested offline.
 */
import { groundUnder, idolBroadleafKey, idolTreePlacement, treeIsBroadleaf } from "./idolArt";
import { makeRng } from "./sim";
import { treesBlockingShot } from "./treeClearance";
import type { CourseSpec, HoleSpec, HoleTerrain, TreeObstacle, Vec2 } from "./types";

export interface CourseTreeSpot { readonly x: number; readonly z: number; readonly h: number; readonly yaw: number }

/** seed of the hole scene's rng (main.ts buildHoleScene); the tree spots are its first draws */
export function holeSceneSeed(course: Pick<CourseSpec, "id">, hole: Pick<HoleSpec, "number">): number {
  return hole.number * 7919 + course.id.length * 131;
}

/** Sample a point along the hole's polyline at normalized parameter u ∈ [0, 1] (with the path's left-hand normal). */
export function samplePathPoint(path: readonly Vec2[], u: number): { x: number; z: number; nx: number; nz: number } {
  const clamped = Math.max(0, Math.min(1, u));
  const segCount = Math.max(1, path.length - 1);
  const f = clamped * segCount;
  const idx = Math.min(segCount - 1, Math.floor(f));
  const localT = f - idx;
  const a = path[idx]!;
  const b = path[idx + 1] ?? a;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  return { x: a[0] + (b[0] - a[0]) * localT, z: a[1] + (b[1] - a[1]) * localT, nx: -dz / len, nz: dx / len };
}

/** the clubhouse plot behind the green (dunes and parkland), kept clear of trees */
export function clubhouseSpot(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain): { x: number; z: number } | null {
  const theme = course.dressing.theme;
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  return theme === "dunes"
    ? { x: cx - 16, z: cz + hole.layout.greenRadius + 15 }
    : theme === "parkland"
      ? { x: cx - 15, z: cz + hole.layout.greenRadius + 14 }
      : null;
}

/**
 * The hole's corridor trees: two rows each side of the fairway (3.8-8.3 m and 10.5-18 m outside its edge), an arc behind
 * the green, and an outer row on the dunes and parkland; none on sand, water, fairway or green, or on the clubhouse plot,
 * and none at all on the lunar and volcanic courses. `rng` defaults to a fresh hole scene rng.
 */
export function courseTreeSpots(
  course: CourseSpec,
  hole: HoleSpec,
  terrain: HoleTerrain,
  rng: () => number = makeRng(holeSceneSeed(course, hole))
): CourseTreeSpot[] {
  const theme = course.dressing.theme;
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  const fairHalf = hole.layout.fairwayWidth * 0.5;
  const out: CourseTreeSpot[] = [];
  const corridorRows = 12;
  for (let r = 0; r < corridorRows; r++) {
    const u = 0.09 + (r / (corridorRows - 1)) * 0.84;
    const p = samplePathPoint(hole.layout.path, u);
    for (const side of [-1, 1] as const) {
      const lat1 = fairHalf + 3.8 + rng() * 4.5;
      const x1 = p.x + p.nx * side * lat1 + (rng() - 0.5) * 2.2;
      const z1 = p.z + p.nz * side * lat1 + (rng() - 0.5) * 3.0;
      out.push({ x: x1, z: z1, h: 6.8 + rng() * 3.2, yaw: rng() * Math.PI * 2 });

      const lat2 = fairHalf + 10.5 + rng() * 7.5;
      const x2 = p.x + p.nx * side * lat2 + (rng() - 0.5) * 3.0;
      const z2 = p.z + p.nz * side * lat2 + (rng() - 0.5) * 4.0;
      out.push({ x: x2, z: z2, h: 8.2 + rng() * 3.8, yaw: rng() * Math.PI * 2 });
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.38 + (i / 7) * Math.PI * 0.76;
    const dist = hole.layout.greenRadius + 16 + (i % 2) * 5;
    out.push({ x: cx + Math.sin(a) * dist, z: cz + Math.cos(a) * dist, h: 8.5 + (i % 3) * 1.4, yaw: rng() * Math.PI * 2 });
  }
  if (theme === "dunes" || theme === "parkland") {
    for (let i = 0; i < 10; i++) {
      const p = samplePathPoint(hole.layout.path, 0.14 + (i / 9) * 0.72);
      const side = i % 2 === 0 ? -1 : 1;
      const lat = fairHalf + 22 + (i % 4) * 4.5;
      out.push({
        x: p.x + p.nx * side * lat + (rng() - 0.5) * 3.5,
        z: p.z + p.nz * side * lat + (rng() - 0.5) * 5.0,
        h: 7.4 + (i % 4) * 1.1,
        yaw: rng() * Math.PI * 2
      });
    }
  }
  if (theme === "lunar" || theme === "volcanic") return [];
  const club = clubhouseSpot(course, hole, terrain);
  return out.filter((tr) => {
    const zKind = terrain.zone(tr.x, tr.z);
    if (zKind === "sand" || zKind === "water" || zKind === "fairway" || zKind === "green") return false;
    return !club || Math.hypot(tr.x - club.x, tr.z - club.z) > 9.5;
  });
}

/* ------------------------------------------------------------------ *
 *  Colliders                                                          *
 * ------------------------------------------------------------------ */

/**
 * Idol broadleaf GLBs, GLB metres (floor at y 0, 8 m tall) before the instance scale. Trunk: centre and radius of the
 * trunk vertices between the mound and the crown; canopy: 90th percentile radius of the crown vertices about the trunk
 * axis, from the 2nd-percentile crown height to the top of the dense crown.
 */
export const IDOL_TREE_COLLIDER: Readonly<Record<string, { trunkR: number; trunkX: number; trunkZ: number; canopyR: number; canopyY0: number; canopyY1: number }>> = {
  linksIdolOakGreen: { trunkR: 0.6, trunkX: -0.05, trunkZ: 0.45, canopyR: 3.8, canopyY0: 2.5, canopyY1: 7.8 },
  linksIdolMapleRed: { trunkR: 0.3, trunkX: 0.2, trunkZ: 0.08, canopyR: 3.05, canopyY0: 3.0, canopyY1: 7.8 },
  linksIdolMapleOrange: { trunkR: 0.32, trunkX: 0.13, trunkZ: 0.28, canopyR: 3.15, canopyY0: 2.65, canopyY1: 7.8 }
};

/**
 * Procedural trees (art/proceduralModels.ts buildCourseTreeBatches), model units before the h / 6.3 scale: the swept
 * trunk (radius 0.28 at the root, 0.23 tapering, to 3.55), the oak `layeredCanopyMesh` (radius 2.15, height 3.5, at
 * y 2.22: puffs from ~2.6 to ~5.9, ~2.4 wide) and the pine `coniferBoughTierMesh` (base radius 1.98, height 4.95, at
 * y 1.52: tiers from ~1.35 to ~6.4, narrowing to a point).
 */
export const PROC_TREE_SCALE_DIV = 6.3;
/** procedural trunk base grounding (mirrors art/proceduralModels.ts coniferBaseY: root spread x scale, CONIFER_GROUND_SINK) */
export const PROC_TREE_ROOT_SPREAD = 0.45;
export const PROC_TREE_GROUND_SINK = 0.12;
export const PROC_TREE_COLLIDER = {
  trunkR: 0.24,
  oak: { canopyR: 2.4, canopyTopR: 2.4, canopyY0: 2.6, canopyY1: 5.9 },
  pine: { canopyR: 1.9, canopyTopR: 0.3, canopyY0: 1.35, canopyY1: 6.4 }
} as const;

export type TreeLook = "idol" | "original";

/** one collider per tree, index-aligned with `trees` (the list main.ts draws) */
export function treeColliders(terrain: HoleTerrain, trees: readonly CourseTreeSpot[], theme: string, look: TreeLook): TreeObstacle[] {
  let broadleaf = 0;
  return trees.map((tr, i) => {
    const isBroadleaf = treeIsBroadleaf(theme, i);
    if (look === "idol" && isBroadleaf) {
      const key = idolBroadleafKey(theme, broadleaf++);
      const c = IDOL_TREE_COLLIDER[key] ?? IDOL_TREE_COLLIDER.linksIdolOakGreen!;
      const { position, scale } = idolTreePlacement(terrain.height, tr, theme, key);
      const wide = (scale[0] + scale[2]) / 2;
      // the trunk sits off the GLB origin: scale, then turn with the instance yaw (rotation about +Y)
      const lx = c.trunkX * scale[0], lz = c.trunkZ * scale[2];
      const cs = Math.cos(tr.yaw), sn = Math.sin(tr.yaw);
      return {
        x: tr.x,
        z: tr.z,
        trunkX: tr.x + lx * cs + lz * sn,
        trunkZ: tr.z - lx * sn + lz * cs,
        trunkR: c.trunkR * wide,
        canopyR: c.canopyR * wide,
        canopyY0: position[1] + c.canopyY0 * scale[1],
        canopyY1: position[1] + c.canopyY1 * scale[1]
      };
    }
    // procedural: the Idol look draws its conifers as a conifers-only batch (every one a pine); `?look=original` splits
    // oak / pine by the same broadleaf rule
    const oak = look === "original" && isBroadleaf;
    const s = tr.h / PROC_TREE_SCALE_DIV;
    // trunk base as drawn (proceduralModels.ts coniferBaseY): lowest ground under the root spread, sunk a little
    const y = groundUnder(terrain.height, tr.x, tr.z, PROC_TREE_ROOT_SPREAD * s) - PROC_TREE_GROUND_SINK;
    const dunes = theme === "dunes";
    const crown = oak ? PROC_TREE_COLLIDER.oak : PROC_TREE_COLLIDER.pine;
    const wide = dunes ? (oak ? (1.15 + 1.08) / 2 : (1.06 + 1.04) / 2) : 1;
    const tall = dunes ? (oak ? 0.88 : 0.94) : 1;
    return {
      x: tr.x,
      z: tr.z,
      trunkR: PROC_TREE_COLLIDER.trunkR * s,
      canopyR: crown.canopyR * s * wide,
      canopyTopR: crown.canopyTopR * s * wide,
      canopyY0: y + crown.canopyY0 * s * tall,
      canopyY1: y + crown.canopyY1 * s * tall
    };
  });
}

/** the colliders of the trees still drawn for a shot from `ball` aimed at `yaw` (the clearance-hidden ones drop out) */
export function visibleTreeColliders(
  colliders: readonly TreeObstacle[],
  trees: readonly CourseTreeSpot[],
  ball: readonly [number, number],
  yaw: number,
  hidden: ReadonlySet<number> = treesBlockingShot(trees, ball, yaw)
): TreeObstacle[] {
  return colliders.filter((_, i) => !hidden.has(i));
}
