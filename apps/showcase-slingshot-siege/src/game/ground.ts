/**
 * Slingshot Siege island ground, shared by the physics sim (static ground boxes), the level layout settle (pieces
 * spawn on the ground under them) and the autopilot's trajectory search. Pure data, no engine imports.
 */

/**
 * The island's walkable ground as static boxes (x0, x1, z0, z1), tops at y 0, matched to the visual shoreline of the
 * stage meshes (tests/unit/slingshot-siege/shore-and-spent-shots.test.ts). The ground used to be one 120 x 88 m slab,
 * so a shot that cleared the fort landed on invisible floor over the sea (x 19), sat 0.26 m above the water and rolled
 * back. Past these boxes there is only water: anything that drops below `SEA_Y` there sinks.
 *
 * A box with three more numbers (a, b, c) is a sloped beach slab: its top is the plane
 * `y = a + b (x - cx) + c (z - cz)` about the box centre, least-squares fitted to the stage's sand. The beach right of
 * the fort drops from the turf lip (y 0 at x ~10.1) to the waterline (y ~-0.23 at x 11.6); with a flat top at y 0 a
 * block knocked onto it rested ~0.2 m above the sand (real-GPU audit 2026-11-19). `groundTopAt` reads the same table.
 */
export type GroundBox = readonly [number, number, number, number] | readonly [number, number, number, number, number, number, number];
export const GROUND_BOXES: readonly GroundBox[] = [
  [-7.7, 9.2, -2.6, 2.6], // lane and fort
  [9.2, 10.1, -2.2, 2.2], // turf lip right of the fort
  [10.1, 11.6, -2.6, 2.6, -0.156, -0.101, -0.0052], // right beach, sloping to the waterline
  [9.2, 10.6, 2.2, 4.4, -0.1507, -0.0813, -0.0666], // front-right beach
  [9.2, 10.8, -3.4, -2.2, -0.1205, -0.0646, 0.0451], // back-right beach
  [9.2, 10.2, -4.4, -3.4, -0.1547, -0.0332, 0.0552], // back-right beach under the cliff
  [-9.1, -7.7, -1.1, 1.1], // sling apron
  [-6.6, 9.2, 2.6, 4.4], // front beach
  [-4.6, 8.0, 4.4, 5.8],
  [-6.9, 9.2, -4.4, -2.6], // back meadow
  [-5.5, 9.5, -6.0, -4.4]
];
/** Top of one ground box at (x, z) (flat boxes: 0). */
function boxTop(b: GroundBox, x: number, z: number): number {
  if (b.length < 7) return 0;
  return b[4]! + b[5]! * (x - (b[0] + b[1]) / 2) + b[6]! * (z - (b[2] + b[3]) / 2);
}
/** The sim ground's top height at (x, z), or null over open water (the highest box when slabs overlap). */
export function groundTopAt(x: number, z: number): number | null {
  let top: number | null = null;
  for (const b of GROUND_BOXES) {
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const y = boxTop(b, x, z);
    if (top === null || y > top) top = y;
  }
  return top;
}
/** True when (x, z) is over the island's ground (not open water). */
export function onLand(x: number, z: number, margin = 0): boolean {
  return GROUND_BOXES.some(([x0, x1, z0, z1]) => x >= x0 - margin && x <= x1 + margin && z >= z0 - margin && z <= z1 + margin);
}
