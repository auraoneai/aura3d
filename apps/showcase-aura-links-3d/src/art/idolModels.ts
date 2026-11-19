/**
 * Aura Links 3D — Idol image-to-3D set pieces (speridlabs/idol/max GLBs, tools/idol/specs/aura-links-3d.json).
 *
 * Render layer only: every builder keeps the footprint, placement, pivot and runtime node id of the procedural builder it
 * stands in for (proceduralModels.ts), so gameplay, cameras and the QA hooks see the same scene. `?look=original` keeps the
 * procedural builders (main.ts).
 */
import { game, group, instances, model } from "@aura3d/engine";
import { assets } from "../aura-assets";
import { IDOL_CLUMP_BY_THEME, IDOL_CLUMP_STRIDE, IDOL_GROUND_SINK, IDOL_SPECTATORS, IDOL_TREE_HEIGHT, groundUnder, idolBroadleafKey, idolTreePlacement, treeIsBroadleaf } from "../game/idolArt";
import { buildCourseTreeBatches } from "./proceduralModels";
import type { CourseSpec, HoleTerrain, Vec3 } from "../game/types";

type ModelKey = keyof typeof assets;
const asset = (key: string) => assets[key as ModelKey] as typeof assets.linksIdolGolfCart;
const nodeName = (n: any): string | undefined => {
  try {
    return (typeof n?.toJSON === "function" ? n.toJSON() : n)?.name;
  } catch {
    return undefined;
  }
};
/** drop procedural nodes by name (the Idol model takes their place) */
export const withoutNodes = (nodes: readonly any[], names: readonly string[]): any[] => nodes.filter((n) => !names.includes(nodeName(n) ?? ""));

/**
 * Corridor trees: same spots, heights, yaws and biome broadleaf / conifer split as `buildCourseTreeBatches`. Broadleaves are
 * instanced Idol models (normalised to IDOL_TREE_HEIGHT, so `h / height` gives the old world height, narrowed to the old
 * canopy footprint); conifers keep the procedural pine batches.
 */
export function buildIdolTreeBatches(
  terrain: HoleTerrain,
  trees: readonly { x: number; z: number; h: number; yaw: number }[],
  theme: string,
  turfOn: boolean,
  reducedMotion: boolean
): any[] {
  const batches = new Map<string, { position: Vec3; rotation: Vec3; scale: Vec3 }[]>();
  const conifers: { x: number; z: number; h: number; yaw: number }[] = [];
  let broadleaf = 0;
  trees.forEach((tr, i) => {
    if (!treeIsBroadleaf(theme, i)) {
      conifers.push(tr);
      return;
    }
    const key = idolBroadleafKey(theme, broadleaf++);
    // trunk base on the LOWEST ground under the trunk + mound footprint, narrowed canopy (game/idolArt.ts idolTreePlacement;
    // game/treeSpots.ts builds the ball's tree colliders from the same transform)
    (batches.get(key) ?? batches.set(key, []).get(key)!).push(idolTreePlacement(terrain.height, tr, theme, key));
  });
  return [
    ...(conifers.length ? buildCourseTreeBatches(terrain, conifers, theme, turfOn, reducedMotion, true) : []),
    ...[...batches.entries()].map(([key, transforms]) => {
      const build = (list: readonly { position: Vec3; rotation: Vec3; scale: Vec3 }[]) =>
        instances.model(asset(key), {
          name: `idol-trees-${key}`,
          scaleMode: "world",
          transforms: list,
          castShadow: false,
          receiveShadow: true,
          // the procedural canopies swayed in the wind (strength 0.08; the wind spec has no speed term); the Idol trees sway the same way, bending
          // fully at the GLB's own crown height (metres) and not at all at the root
          ...(turfOn && !reducedMotion ? { wind: { strength: 0.08, assetHeight: IDOL_TREE_HEIGHT[key] ?? 8 } } : {})
        });
      // A wind-swayed batch is a packed scatter: the engine cannot change its instances live (INSTANCE_SCATTER_RUNTIME_UNSUPPORTED),
      // so the shot clearance (main.ts applyTreeClearance) rebuilds it from the full list minus the hidden trees.
      const node = build(transforms);
      (node as any).rebuildTreeBatch = (keep: readonly number[]) => build(keep.map((i) => transforms[i]!));
      (node as any).treeBatchTransforms = transforms;
      return node;
    })
  ];
}

/** clubhouse body: the stone links house on the dunes, the half-timbered house in the parkland (same spot, faces the cup) */
export function buildIdolClubhouseNode(course: CourseSpec, terrain: HoleTerrain, x: number, z: number): any {
  // 12 x 12 m footprint: the lowest ground under it, so no corner of the plinth floats on the dunes
  const y = groundUnder(terrain.height, x, z, 8.5) - IDOL_GROUND_SINK;
  const yaw = Math.atan2(terrain.cup[0] - x, terrain.cup[2] - z);
  const key = course.dressing.theme === "parkland" ? "linksIdolClubhouseTudor" : "linksIdolClubhouseStone";
  return model(asset(key), { name: "clubhouse-lodge", scaleMode: "world", castShadow: false, receiveShadow: true })
    .position(x, y, z)
    .rotate(0, yaw, 0);
}

/**
 * Gallery spectators (`gallery-spectators` runtime group): 9 fans on the arc behind the gallery ropes (the procedural arc,
 * without its per-figure random jitter) and 3 standing at the foot of each grandstand, all facing the cup.
 */
/** ground a gallery fan never stands on */
export const GALLERY_BLOCKED_ZONES: ReadonlySet<string> = new Set(["sand", "water", "green", "fringe"]);

export function buildIdolGallerySpectatorsNode(cx: number, cz: number, greenRadius: number, terrain: HoleTerrain): any {
  const figures: any[] = [];
  const add = (x0: number, z0: number, i: number) => {
    // owner fix (no walking through / standing in hazards): a fan never stands in a bunker, pond, on the green or fringe;
    // step straight back from the cup until the feet are on rough or fairway
    let x = x0, z = z0;
    const dx = x0 - cx, dz = z0 - cz, dl = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 24 && GALLERY_BLOCKED_ZONES.has(terrain.zone(x, z) as string); k++) {
      x += (dx / dl) * 0.5;
      z += (dz / dl) * 0.5;
    }
    const yaw = Math.atan2(cx - x, cz - z);
    figures.push(
      model(asset(IDOL_SPECTATORS[i % IDOL_SPECTATORS.length]!), { name: `gallery-fan-${i}`, scaleMode: "world", castShadow: false, receiveShadow: true })
        .position(x, groundUnder(terrain.height, x, z, 0.25) - 0.03, z)
        .rotate(0, yaw, 0)
    );
  };
  for (let i = 0; i < 9; i += 1) {
    const a = ((i + 0.5) / 9) * Math.PI * 1.24 - Math.PI * 0.12 + Math.sin(i * 2.3) * 0.03;
    const r = greenRadius + 3.85 + (i % 3) * 0.55;
    add(cx + Math.cos(a) * r, cz + Math.abs(Math.sin(a)) * r * 0.86, i);
  }
  let n = 9;
  for (const side of [-1, 1] as const) {
    const sx = cx + side * (greenRadius + 10.5);
    const sz = cz + 3.5;
    const bYaw = Math.atan2(cx - sx, cz - sz);
    const cosY = Math.cos(bYaw), sinY = Math.sin(bYaw);
    for (let k = 0; k < 3; k += 1) {
      const localX = (k - 1) * 1.9;
      const localZ = 2.6 + (k % 2) * 0.5;
      add(sx + localX * cosY + localZ * sinY, sz - localX * sinY + localZ * cosY, n++);
    }
  }
  return group("gallery-spectators", figures).runtime(game.runtimeNode("gallery-spectators"));
}

/** tee ball washer (`tee-ball-washer`): same spot as the procedural washer beside the right tee marker */
export function buildIdolBallWasherNode(terrain: HoleTerrain): any {
  const x = terrain.tee[0] + 4.35;
  const z = terrain.tee[2] - 1.15;
  return model(asset("linksIdolBallWasher"), { name: "tee-ball-washer", scaleMode: "world", castShadow: false, receiveShadow: true })
    .position(x, groundUnder(terrain.height, x, z, 0.25) - 0.03, z)
    .rotate(0, terrain.lineYaw + Math.PI, 0);
}

/**
 * Rough grass clumps: every IDOL_CLUMP_STRIDE-th spot of the ground-cover tuft plan (game/groundCover.ts, its own seeded
 * placement, rough only) gets the theme's Idol clump, standing on its ground and swaying like the old tufts.
 */
export function buildIdolClumpBatch(
  terrain: HoleTerrain,
  theme: string,
  plan: { readonly transforms: readonly { readonly position: readonly number[]; readonly rotation: readonly number[]; readonly scale: readonly number[] }[] },
  wind: false | { readonly strength: number; readonly gustStrength: number; readonly assetHeight: number }
): any | null {
  const clump = IDOL_CLUMP_BY_THEME[theme];
  if (!clump) return null;
  const transforms = plan.transforms
    .filter((_, i) => i % IDOL_CLUMP_STRIDE === 0)
    .map((t) => {
      const x = t.position[0]!, z = t.position[2]!, s = t.scale[0]! * 0.9;
      return { position: [x, groundUnder(terrain.height, x, z, 0.15) - 0.03, z] as Vec3, rotation: [0, t.rotation[1]!, 0] as Vec3, scale: [s, s, s] as Vec3 };
    });
  if (!transforms.length) return null;
  return instances.model(asset(clump.key), {
    name: "ground-cover-idol-clumps",
    scaleMode: "world",
    transforms,
    castShadow: false,
    receiveShadow: true,
    ...(wind ? { wind: { strength: wind.strength, gustStrength: wind.gustStrength, assetHeight: clump.height } } : {})
  });
}
