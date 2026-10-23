/**
 * Ninja Runner course: the route spline, terrain profile, biome table, rooftop/branch gap table and
 * lane width. Transcribed from the original's course module (same constants and operation order, so
 * values are bit-identical to the original's). Pure and DOM-free.
 */

export const COURSE_LENGTH = 2640;

/** Smoothstep of (t - a) / (b - a), clamped. Original `At`. */
export const smooth = (a: number, b: number, t: number): number => {
  const n = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return n * n * (3 - 2 * n);
};

/** Route control points in (x, z), Catmull-Rom interpolated. Original `Mr`. */
export const ROUTE_POINTS: readonly (readonly [number, number])[] = [
  [0, 0], [8, -140], [-42, -290], [24, -425], [95, -535], [55, -670], [-25, -790], [15, -935], [105, -1030], [215, -1085],
  [270, -1220], [220, -1370], [110, -1500], [160, -1660], [295, -1750], [335, -1900], [270, -2050], [320, -2200], [465, -2330], [485, -2500]
];

/** Uniform Catmull-Rom on the control polyline, t in [0, 1]. Original `t0`. */
function routeAt(t: number): [number, number] {
  const e = t * (ROUTE_POINTS.length - 1);
  const k = Math.min(ROUTE_POINTS.length - 2, Math.floor(e));
  const n = e - k;
  const s = ROUTE_POINTS[Math.max(0, k - 1)]!;
  const r = ROUTE_POINTS[k]!;
  const a = ROUTE_POINTS[k + 1]!;
  const o = ROUTE_POINTS[Math.min(ROUTE_POINTS.length - 1, k + 2)]!;
  const axis = (l: 0 | 1): number =>
    0.5 * (2 * r[l] + (-s[l] + a[l]) * n + (2 * s[l] - 5 * r[l] + 4 * a[l] - o[l]) * n * n + (-s[l] + 3 * r[l] - 3 * a[l] + o[l]) * n * n * n);
  return [axis(0), axis(1)];
}

interface RouteSample { d: number; x: number; z: number }

/** 4097 samples with accumulated arc length rescaled so the route is exactly COURSE_LENGTH long. */
const ROUTE_TABLE: RouteSample[] = (() => {
  const table: RouteSample[] = [];
  let total = 0;
  let prev = routeAt(0);
  for (let i = 0; i <= 4096; i++) {
    const p = routeAt(i / 4096);
    total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    table.push({ d: total, x: p[0], z: p[1] });
    prev = p;
  }
  const scale = COURSE_LENGTH / total;
  for (const row of table) { row.d *= scale; row.x *= scale; row.z *= scale; }
  return table;
})();

export interface RouteFrame { x: number; z: number; dx: number; dz: number }

/** Position and unit tangent at distance `i` along the route (extrapolated past the ends). Original `nS`. */
export function routeFrame(i: number): RouteFrame {
  let lo = 0;
  let hi = ROUTE_TABLE.length - 1;
  const clamped = Math.max(0, Math.min(COURSE_LENGTH, i));
  for (; hi - lo > 1;) {
    const mid = (lo + hi) >> 1;
    if (ROUTE_TABLE[mid]!.d < clamped) lo = mid; else hi = mid;
  }
  const s = ROUTE_TABLE[lo]!;
  const r = ROUTE_TABLE[hi]!;
  const a = (clamped - s.d) / (r.d - s.d);
  const o = r.x - s.x;
  const l = r.z - s.z;
  const c = Math.hypot(o, l);
  const h = i - clamped;
  return { x: s.x + o * a + (o / c) * h, z: s.z + l * a + (l / c) * h, dx: o / c, dz: l / c };
}

/** Biome id for rendering/ambience. Original `Na`. */
export function biomeAt(i: number): string {
  return i < 160 ? "village" : i < 470 ? "alley" : i < 550 ? "stairs" : i < 1000 ? "rooftops" : i < 1120 ? "descent" : i < 1240 ? "riverside" : i < 1390 ? "bridge" : i < 1510 ? "riverside" : i < 1620 ? "forest_entry" : i < 2120 ? "forest" : i < 2260 ? "forest_exit" : "water";
}

/** District caption. Original `Ua`. */
export function districtAt(i: number): string {
  return i < 160 ? "Hidden Leaf Village" : i < 470 ? "The Backstreets" : i < 1120 ? "Above the Village" : i < 1510 ? "The Naka Crossing" : i < 2260 ? "Forest of Death" : "Valley of the End";
}

/** Path width. Original `kt`. */
export function pathWidth(i: number): number {
  return 8.6 - 4.2 * smooth(120, 180, i) + 1.6 * smooth(470, 560, i) + 1.2 * smooth(1030, 1140, i) - 0.7 * smooth(1210, 1250, i) - 1.1 * smooth(1490, 1620, i) + 4.6 * smooth(2180, 2280, i);
}

/** Rail/wall height profile. Original `Bs`. */
export function railHeight(i: number, e = 0): number {
  const t = 1.84 + 2 * smooth(250, 450, i) - 2 * smooth(1000, 1120, i);
  return t + (1 - t) * smooth(1470, 1530, i) - 3.3 * smooth(2200, 2260, i) * (1 - smooth(12, 35, Math.abs(e)));
}

/** Ground height along the route. Original `Lt`. */
export function groundHeight(i: number): number {
  const e = smooth(1236, 1244, i) * (1 - smooth(1386, 1394, i)) * Math.sin(Math.PI * Math.max(0, Math.min(1, (i - 1240) / 150))) ** 2 * 5;
  return 2 + 2 * smooth(250, 450, i) + 12 * smooth(470, 550, i) - 14 * smooth(1000, 1120, i) + e + 17 * smooth(1510, 1630, i) - 18.75 * smooth(2110, 2260, i)
    + Math.sin((i - 550) * 0.033) * 0.8 * smooth(540, 570, i) * (1 - smooth(970, 1000, i))
    + Math.sin((i - 1620) * 0.018) * 2 * smooth(1620, 1670, i) * (1 - smooth(2070, 2120, i));
}

/** Cross-section offset (stair slope on the rooftops, bowl in the forest). Original `ul`. */
export function crossSection(i: number, e: number): number {
  const t = smooth(546, 556, i) * (1 - smooth(994, 1004, i));
  const n = smooth(1590, 1630, i) * (1 - smooth(2100, 2150, i));
  const s = pathWidth(i) * 0.5;
  return -t * Math.abs(e) * 0.35 + n * (Math.sqrt(Math.max(0, 1 - (e / s) ** 2)) - 1) * 1.7;
}

export interface GroundFrame { x: number; y: number; z: number; heading: number; dx: number; dz: number }

/** World position of (distance, lateral offset, height above ground). Original `gt`. */
export function groundFrame(i: number, e = 0, t = 0): GroundFrame {
  const n = routeFrame(i);
  return { x: n.x - n.dz * e, y: groundHeight(i) + crossSection(i, e) + t, z: n.z + n.dx * e, heading: Math.atan2(-n.dx, -n.dz), dx: n.dx, dz: n.dz };
}

/** Lane offset in metres for lane -1/0/1 at distance i. Original `Ft`. */
export const laneOffset = (i: number): number => Math.min(2.35, pathWidth(i) * 0.27);

/** Rooftop / branch gaps [start, end) the runner must jump. Original `dl`. */
export const GAPS: readonly (readonly [number, number])[] = Object.freeze([
  [594, 600], [644, 651], [704, 711], [759, 766], [822, 829], [877, 884], [937, 944], [980, 986], [1815, 1822], [1987, 1994]
] as const);

/** The gap containing distance i, if any. Original `Rn`. */
export const gapAt = (i: number): readonly [number, number] | undefined => GAPS.find(([e, t]) => i >= e && i <= t);

/** True within `e` metres of any gap. Original `Gh`. */
export const nearGap = (i: number, e = 12): boolean => GAPS.some(([t, n]) => i >= t - e && i <= n + e);

/** First gap starting at or ahead of i within e metres. Original `lf`. */
export const gapAhead = (i: number, e = 9): readonly [number, number] | undefined => GAPS.find(([t]) => t >= i && t - i <= e);
