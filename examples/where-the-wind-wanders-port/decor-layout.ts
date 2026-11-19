/**
 * Where the decor stands in the valley (pure data, no engine imports). Shared by the scenery builder
 * (`scenery.ts`), the model mount (`art/proceduralModels.ts`) and the collision layer (`colliders.ts`), so a piece the
 * player can see is always the piece the player bumps into.
 *
 * Pass-through rule (owner QA 2026-11-18): nothing solid stands inside the walking path (|z - pathZ(x)| < PATH_HALF_WIDTH
 * plus its own footprint); everything solid in the walkable meadow has a collider that matches its drawn footprint.
 */

/** Half width of the worn walking path (the band foliage keeps clear of in `scenery.ts`). */
export const PATH_HALF_WIDTH = 2.2;

/** Wooden signposts (post + board): x, z, board yaw. Both stand on the south verge of the path, clear of the walk
 * and of the original's recorded shortcut from the path down to the windmill letter (x 11-14). */
export const SIGNPOSTS: readonly (readonly [number, number, number])[] = [[-14.8, -0.85, 0.2], [16.6, 2.45, -0.15]];
/** Signpost collision radius (the 1.05 m board turns about the post). */
export const SIGNPOST_R = 0.5;

/** The three Idol villagers greeting the Bellkeeper, on the verges (never in the walk). */
export const VILLAGER_SPOTS: readonly { readonly x: number; readonly z: number; readonly yaw: number }[] = [
  { x: -12.0, z: -0.6, yaw: 0.42 },
  { x: 15.4, z: 2.35, yaw: -0.52 },
  { x: 20.2, z: 7.9, yaw: -0.24 }
];
export const VILLAGER_R = 0.45;

/** Wayside lantern posts (x, z, yaw) on the verges, and the jetty-end lantern (x, z, yaw). */
export const PATH_LANTERNS: readonly (readonly [number, number, number])[] = [[-13.4, -0.7, 0.35], [14.2, 2.3, -0.3]];
export const JETTY_LANTERN: readonly [number, number, number] = [31, -17.52, 0];
export const LANTERN_R = 0.3;

/** Wayside shrine (x, z, yaw) and its collision radius (1.73 x 1.77 m plan). */
export const SHRINE_SPOT: readonly [number, number, number] = [21.8, 8.4, -0.28];
export const SHRINE_R = 0.9;

/** Packhorse bridge over the stream: centre, yaw (its span runs along world z), deck length and outer width. */
export const BRIDGE_SPOT = { x: -4.0, z: -6.54, yaw: Math.PI * 0.5 - 0.06, length: 6.4, width: 5.43 } as const;
/** Parapets sit this far in from the bridge's outer plan edge (the ramps flare wider than the deck). */
export const BRIDGE_PARAPET_INSET = 1.2;

/** Model-set fence bays (3.86 m long, centred on x) and the dry-stone walls behind them: x0, x1, z, half depth. */
export const FENCE_BAY_HALF = 1.93;
export const FENCE_BAYS: readonly { readonly x: number; readonly z: number; readonly scale: number }[] = [
  ...[-18, -14, -10].map((x) => ({ x, z: -4, scale: 1.02 })),
  ...[25, 29, 33, 37, 41].map((x) => ({ x, z: 7, scale: 0.96 }))
];
export const DRYSTONE_WALLS: readonly { readonly x: number; readonly z: number; readonly length: number }[] = [
  { x: -14, z: -4.45, length: 11.4 },
  { x: 33, z: 7.45, length: 18.8 }
];
export const DRYSTONE_HALF_DEPTH = 0.3;

/** Extra standing stone beside the bell meadow (x, z, yaw, scale). */
export const EXTRA_STANDING_STONE: readonly [number, number, number, number] = [43.5, 7.4, -0.42, 0.78];
/** Standing stone + cairn collision radius per unit scale (monolith 0.62 m, cairn flaring to ~1.3 m). */
export const STANDING_STONE_R = 1.15;

/** Idol cottage plans (x, z at scale 1) and the share of the half-extent that is wall (inside the eaves). */
export const IDOL_COTTAGE_PLANS: readonly (readonly [number, number])[] = [[8.38, 9.77], [8.38, 8.375]];
export const IDOL_COTTAGE_WALL_SHARE = 0.7;

/** The two cottages (centre on the sim's STRUCTURES circles): x, z, scale, yaw. */
export const COTTAGE_LAYOUT: readonly { readonly x: number; readonly z: number; readonly s: number; readonly yaw: number }[] = [
  { x: -4, z: -13, s: 1.12, yaw: 0 },
  { x: -49, z: -16, s: 0.95, yaw: 0.5 }
];
/** Procedural cottage wall box per unit scale (scenery.ts `cottage`: 7.2 x 5.4 m plus the 0.3 m plinth). */
export const COTTAGE_WALLS: readonly [number, number] = [7.5, 5.7];

/**
 * Desire lines: the routes players actually walk off the path between the letters and the bell, read off the original's
 * recorded session (evidence/crayon-capture/where-the-wind-wanders-reference.json): path -> windmill letter -> shore
 * letter -> bell. Trees and rocks keep this clear, so the original's route never meets a collider the original lacked.
 */
export const DESIRE_LINES: readonly (readonly (readonly [number, number])[])[] = [
  [[7.4, 3.2], [9.8, 2.4], [12.1, 1.6], [14.3, 0.5], [16.2, -1.3], [17.3, -3.5], [18.5, -3.9]],
  [[18.5, -3.9], [21, -3.4], [23.3, -2.4], [25.3, -3.7], [27.4, -5.4], [29.5, -7.1], [30.8, -9.1], [31, -13.6]],
  [[31, -11.2], [31.5, -8.8], [33.2, -6.7], [34.9, -4.7], [36.6, -2.6], [38.3, -0.5], [40.2, 1.1], [42.4, 2.2], [44.6, 3.3], [46.6, 4.3], [49, 5]]
];
export const DESIRE_LINE_HALF_WIDTH = 1.3;

/** Distance from (x, z) to the nearest desire line. */
export function desireLineDistance(x: number, z: number): number {
  let best = Infinity;
  for (const line of DESIRE_LINES) {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!, [bx, bz] = line[i]!;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
  }
  return best;
}
