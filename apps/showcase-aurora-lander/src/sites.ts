/**
 * Aurora Lander site definitions — the PRD's three-site expedition arc.
 *
 * Pure data + pure derived math so unit tests and the browser route read the exact
 * same numbers. Terrain shape (seed, cells, scale), pad placement and fuel budgets
 * all live here; `terrain.ts` turns a site into geometry/collider/query inputs.
 */

export interface LandingPad {
  /** Pad center in terrain-plane units (X/Z). */
  readonly x: number;
  readonly z: number;
  /** Plateau radius in world units. Feet must rest inside this zone to score. */
  readonly radius: number;
}

export interface GustWindow {
  /** Gust start time within an attempt, seconds. */
  readonly startSeconds: number;
  /** Sinusoidal period, seconds. */
  readonly periodSeconds: number;
  /** Peak lateral force in authored thrust-equivalent units. */
  readonly amplitude: number;
  /** Telegraph lead time before the first gust, seconds. */
  readonly warnLeadSeconds: number;
}

export interface LanderSite {
  readonly id: number;
  readonly name: string;
  /** Seed for the value-noise heightfield (deterministic per site). */
  readonly seed: number;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly pads: readonly LandingPad[];
  /** Authored fuel budget in arbitrary "burn seconds" at full main thrust. */
  readonly fuelBudget: number;
  /** Score multiplier applied when this site is cleared. */
  readonly multiplier: number;
  /** Storm-front gust profile; absent on the introductory site. */
  readonly gust?: GustWindow | undefined;
  /** Authored 0..1 renderer-owned snow/whiteout density. */
  readonly whiteout: number;
  /** Site palette tint for the terrain material. */
  readonly terrainColor: string;
  readonly skyColor: string;
  readonly auroraColor: string;
}

/** Shared terrain field dimensions: 96m x 96m plane at 1.5m cell resolution. */
export const TERRAIN_CELLS_X = 65;
export const TERRAIN_CELLS_Z = 65;
export const TERRAIN_CELL_SIZE = 1.5;
/** Vertical noise scale in meters before site-specific relief multipliers. */
export const TERRAIN_HEIGHT_SCALE = 9;

/**
 * The campaign opens high enough to teach descent planning and reach the first
 * storm window, while remaining below the decorative aurora curtains. X/Z are
 * authored for the route's single readable lateral-control plane.
 */
export const SPAWN_HEIGHT_ABOVE_PAD = 72;

export const SITES: readonly LanderSite[] = [
  {
    id: 1,
    name: "Wide Valley",
    seed: 0xa0_01,
    spawn: { x: 8, y: SPAWN_HEIGHT_ABOVE_PAD, z: 8 },
    pads: [{ x: 8, z: 8, radius: 7 }],
    fuelBudget: 26,
    multiplier: 1,
    whiteout: 0.12,
    terrainColor: "#3f5546",
    skyColor: "#101a2e",
    auroraColor: "#5eead4"
  },
  {
    id: 2,
    name: "Canyon Shelf",
    seed: 0xc2_02,
    spawn: { x: -4, y: SPAWN_HEIGHT_ABOVE_PAD, z: -10 },
    pads: [{ x: 10, z: -10, radius: 5 }],
    fuelBudget: 23,
    multiplier: 2,
    gust: {
      startSeconds: 9,
      amplitude: 0.12,
      periodSeconds: 14,
      warnLeadSeconds: 2.8
    },
    whiteout: 0.34,
    terrainColor: "#585043",
    skyColor: "#131729",
    auroraColor: "#7dd3fc"
  },
  {
    id: 3,
    name: "Ridgeline",
    seed: 0x11_03,
    spawn: { x: 4, y: SPAWN_HEIGHT_ABOVE_PAD, z: -4 },
    pads: [{ x: -12, z: -4, radius: 3.6 }],
    fuelBudget: 21,
    multiplier: 3,
    gust: {
      startSeconds: 10,
      amplitude: 0.2,
      periodSeconds: 11,
      warnLeadSeconds: 2.8
    },
    whiteout: 0.62,
    terrainColor: "#5c5c66",
    skyColor: "#0e1526",
    auroraColor: "#a78bfa"
  }
] as const;

/** Campaign score = sum of cleared-site scores (PRD §3). */
export function campaignScore(siteScores: readonly number[]): number {
  return siteScores.reduce((sum, value) => sum + value, 0);
}
