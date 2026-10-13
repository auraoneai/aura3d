/**
 * Patrol Wing course data — authored terrain, pad, and ring-gate constants.
 *
 * Extracted from legacy sky at 6f3085b3dfa13a4fc50eb67385cf3ef42c68fa0f,
 * values verbatim (src/legacy/sky.ts:29-84). The tribunal scoped this port
 * as "single cut: RING_GATES data"; scoping proved the travelling flight
 * tests also need the terrain/pad surface the FlightModel crashes on (via
 * its `terrainHeight` callback), so this module carries that surface too.
 * The fresh scene renders terrain/pads from this data with new geometry;
 * it does not import the legacy sky builder.
 */

// ---- authored terrain --------------------------------------------------------

export const ISLAND_RADIUS = 26;
export const OCEAN_LEVEL = 0;

/** Authored island height (sea floor goes negative outside the island). */
export function islandHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r > ISLAND_RADIUS) return -6;
  const t = Math.min(1, Math.max(0, 1 - r / ISLAND_RADIUS));
  const envelope = t * t * (3 - 2 * t);
  const peak = 9.6 * envelope;
  const ridge = 2.7 * envelope * Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.42 - 0.7);
  let height = peak + ridge;
  // South cliff plateau blended flat for the landing pad at (0, 17).
  const padDist = Math.hypot(x - PAD_CENTER[0], z - PAD_CENTER[2]);
  const padBlend = Math.min(1, Math.max(0, 1 - padDist / 7));
  const plateau = 3.2;
  height = height * (1 - padBlend) + plateau * padBlend;
  return Math.round(height * 1000) / 1000;
}

/** Walkable/crash surface: the island where it breaks the water, else ocean. */
export function terrainSurface(x: number, z: number): number {
  return Math.max(islandHeight(x, z), OCEAN_LEVEL);
}

export const PAD_CENTER: readonly [number, number, number] = [0, 3.2, 17];
export const PAD_Y = 3.2;
export const PAD_RADIUS = 2.4;
/** Nose west (-X) on the pad: a descending departure over the sea, clear of the island peak. */
export const PAD_HEADING_YAW = Math.PI;

// ---- ring course -------------------------------------------------------------

export interface RingGate {
  readonly index: number;
  readonly position: readonly [number, number, number];
  /** Visual yaw for the torus (perpendicular to the flight path). */
  readonly yaw: number;
  readonly radius: number;
}

/**
 * Six ordered gates counter-clockwise around the island, starting west of the
 * pad's takeoff path. Deterministic constants shared with the unit tests and
 * the browser spec.
 */
export const RING_GATES: readonly RingGate[] = [
  { index: 0, position: [-13, 9, 12], yaw: Math.PI / 4, radius: 2.4 },
  { index: 1, position: [-19, 11, -2], yaw: Math.PI / 2 - 0.4, radius: 2.4 },
  { index: 2, position: [-12, 13, -14], yaw: -Math.PI / 4, radius: 2.4 },
  { index: 3, position: [2, 12, -18], yaw: Math.PI / 2 + 0.2, radius: 2.4 },
  { index: 4, position: [12, 10, -8], yaw: Math.PI / 2 + Math.PI / 4, radius: 2.4 },
  { index: 5, position: [10, 8, 5], yaw: -Math.PI / 2 - 0.3, radius: 2.4 }
];

export const RING_COUNT = RING_GATES.length;
