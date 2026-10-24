/**
 * Zero-G re-entry surface (ported from the original `src/reentry.js`): a spatial
 * hash of the drivable surface triangles per vehicle, queried with a swept
 * segment to find where a drifting rider touches the track again.
 * Built lazily and cached per course because it holds ~tens of thousands of triangles.
 */
import {
  COURSE_LENGTH,
  ISLAND_TILES,
  OPAL,
  SPLIT,
  islandHeight,
  rampHeightAt,
  rampsFor,
  routeOffset,
  trackLane,
  wrapS,
  type Route,
  type Vehicle
} from "./course";
import { activeCourse, routeFrame, surfaceNoise, type Frame } from "./track";
import { Vec3, triangleBarycoord, triangleClosestPoint, triangleContainsPoint, triangleNormal } from "./vec3";

const CELL = 16;
const SKIN = 0.45;

interface Vertex { readonly s: number; readonly lane: number; readonly p: Vec3 }
interface Tri {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  readonly normal: Vec3;
  readonly route: Route;
  readonly vertices: readonly [Vertex, Vertex, Vertex];
}

type Hash = Map<string, Tri[]>;

function forEachCell(min: Vec3, max: Vec3, visit: (key: string) => void): void {
  for (let x = Math.floor(min.x / CELL); x <= Math.floor(max.x / CELL); x++) {
    for (let y = Math.floor(min.y / CELL); y <= Math.floor(max.y / CELL); y++) {
      for (let z = Math.floor(min.z / CELL); z <= Math.floor(max.z / CELL); z++) visit(`${x},${y},${z}`);
    }
  }
}

function buildHash(vehicle: Vehicle): Hash {
  const hash: Hash = new Map();
  const addTriangle = (v0: Vertex, v1: Vertex, v2: Vertex, route: Route): void => {
    const normal = triangleNormal(v0.p, v1.p, v2.p);
    if (normal.dot(routeFrame((v0.s + v1.s + v2.s) / 3, route).up) < 0) normal.negate();
    const tri: Tri = { a: v0.p, b: v1.p, c: v2.p, normal, route, vertices: [v0, v1, v2] };
    const min = new Vec3(Math.min(v0.p.x, v1.p.x, v2.p.x) - SKIN, Math.min(v0.p.y, v1.p.y, v2.p.y) - SKIN, Math.min(v0.p.z, v1.p.z, v2.p.z) - SKIN);
    const max = new Vec3(Math.max(v0.p.x, v1.p.x, v2.p.x) + SKIN, Math.max(v0.p.y, v1.p.y, v2.p.y) + SKIN, Math.max(v0.p.z, v1.p.z, v2.p.z) + SKIN);
    forEachCell(min, max, (key) => {
      let bucket = hash.get(key);
      if (!bucket) hash.set(key, bucket = []);
      bucket.push(tri);
    });
  };

  const strip = (route: Route, from: number, to: number, laneMin?: number, laneMax?: number, ramp = false): void => {
    const rows = Math.ceil((to - from) / 1.5);
    const half = routeOffset((from + to) / 2, route).half;
    let previous: Vertex[] | undefined;
    for (let d = 0; d <= rows; d++) {
      const s = from + (to - from) * d / rows;
      const frame = routeFrame(s, route);
      const row: Vertex[] = Array.from({ length: 5 }, (_, k) => {
        const lo = laneMin ?? -half;
        const hi = laneMax ?? half;
        const lane = lo + (hi - lo) * k / 4;
        const lift = (islandHeight(s, route) ?? 0) + surfaceNoise(s, trackLane(s, lane, route)) + (ramp ? rampHeightAt(Math.min(s, to - 1e-5), lane, vehicle) : 0);
        return { s, lane, p: frame.p.clone().addScaledVector(frame.side, lane).addScaledVector(frame.up, lift + 0.06) };
      });
      if (previous) {
        for (let k = 0; k < 4; k++) {
          addTriangle(previous[k]!, previous[k + 1]!, row[k]!, route);
          addTriangle(previous[k + 1]!, row[k + 1]!, row[k]!, route);
        }
      }
      previous = row;
    }
  };

  strip("main", 0, SPLIT.start);
  strip("main", SPLIT.start, SPLIT.end);
  strip("main", SPLIT.end, OPAL.start);
  strip("main", OPAL.end, COURSE_LENGTH);
  for (const route of ["upper", "lower"] as const) strip(route, SPLIT.start, SPLIT.end);
  strip("bypass", OPAL.start, OPAL.end);
  strip("islands", OPAL.start, ISLAND_TILES[0]!.start);
  for (const tile of ISLAND_TILES) strip("islands", tile.start, tile.end);
  strip("islands", ISLAND_TILES[ISLAND_TILES.length - 1]!.end, OPAL.end);
  for (const ramp of rampsFor(vehicle)) strip("main", ramp.s, ramp.s + ramp.length, ramp.lane - ramp.width / 2, ramp.lane + ramp.width / 2, true);
  return hash;
}

interface Cache { readonly courseId: string; readonly bike: Hash; readonly skate: Hash }
let cache: Cache | undefined;

function ensureHashes(): Cache {
  const id = activeCourse().id;
  if (!cache || cache.courseId !== id) cache = { courseId: id, bike: buildHash("bike"), skate: buildHash("skate") };
  return cache;
}

/** Drop the cached hashes (tests and course changes). */
export function resetReentryCache(): void {
  cache = undefined;
}

export interface ReentryHit {
  readonly s: number;
  readonly lane: number;
  readonly route: Route;
  readonly t: number;
  readonly point: Vec3;
  readonly frame: Frame;
}

/** Sweep the segment `from → to` against the drivable surface; `hintS` unwraps the result. */
export function findReentry(from: Vec3, to: Vec3, vehicle: Vehicle = "bike", hintS = 0): ReentryHit | null {
  const hashes = ensureHashes();
  const hash = vehicle === "skate" ? hashes.skate : hashes.bike;
  const candidates = new Set<Tri>();
  const min = new Vec3(Math.min(from.x, to.x) - SKIN, Math.min(from.y, to.y) - SKIN, Math.min(from.z, to.z) - SKIN);
  const max = new Vec3(Math.max(from.x, to.x) + SKIN, Math.max(from.y, to.y) + SKIN, Math.max(from.z, to.z) + SKIN);
  forEachCell(min, max, (key) => hash.get(key)?.forEach((tri) => candidates.add(tri)));

  let best: (ReentryHit & { t: number }) | null = null;
  const motion = to.clone().sub(from);
  for (const tri of candidates) {
    if (motion.dot(tri.normal) > 1e-5) continue;
    const c = from.clone().sub(tri.a).dot(tri.normal);
    const l = to.clone().sub(tri.a).dot(tri.normal);
    if (c < -0.12 || l > SKIN) continue;
    const u = c > SKIN ? (c - SKIN) / Math.max(1e-9, c - l) : 0;
    if (u > 1 || (best && u > best.t)) continue;
    const point = from.clone().addScaledVector(motion, u);
    point.addScaledVector(tri.normal, -point.clone().sub(tri.a).dot(tri.normal));
    if (!triangleContainsPoint(point, tri.a, tri.b, tri.c)) {
      const closest = triangleClosestPoint(point, tri.a, tri.b, tri.c, new Vec3());
      if (closest.distanceToSquared(point) > 0.12 ** 2) continue;
      point.copy(closest);
    }
    const bary = triangleBarycoord(point, tri.a, tri.b, tri.c, new Vec3()) ?? new Vec3();
    const v = tri.vertices;
    const sInterp = v[0].s * bary.x + v[1].s * bary.y + v[2].s * bary.z;
    const lane = v[0].lane * bary.x + v[1].lane * bary.y + v[2].lane * bary.z;
    const s = hintS + ((sInterp - wrapS(hintS) + COURSE_LENGTH * 1.5) % COURSE_LENGTH - COURSE_LENGTH / 2);
    if (s < 0) continue;
    best = { s, lane, route: tri.route, t: u, point, frame: routeFrame(s, tri.route) };
  }
  return best;
}

export interface UndersideHit {
  readonly point: Vec3;
  /** Unit normal pointing down, away from the strip, toward the rider. */
  readonly normal: Vec3;
  readonly t: number;
  readonly route: Route;
}

/**
 * Sweep a sphere of `radius` up through the drivable strips from below (the underside of the
 * bridges, split routes, ramps and island platforms). `findReentry` ignores motion along a
 * triangle's normal, so a rider flying up under a strip used to pass straight through it.
 */
export function findUndersideBlock(from: Vec3, to: Vec3, vehicle: Vehicle = "bike", radius = 0.8): UndersideHit | null {
  const hashes = ensureHashes();
  const hash = vehicle === "skate" ? hashes.skate : hashes.bike;
  const candidates = new Set<Tri>();
  const margin = radius + SKIN;
  const min = new Vec3(Math.min(from.x, to.x) - margin, Math.min(from.y, to.y) - margin, Math.min(from.z, to.z) - margin);
  const max = new Vec3(Math.max(from.x, to.x) + margin, Math.max(from.y, to.y) + margin, Math.max(from.z, to.z) + margin);
  forEachCell(min, max, (key) => hash.get(key)?.forEach((tri) => candidates.add(tri)));

  let best: UndersideHit | null = null;
  const motion = to.clone().sub(from);
  for (const tri of candidates) {
    if (motion.dot(tri.normal) <= 1e-5) continue;
    const c = from.clone().sub(tri.a).dot(tri.normal);
    const l = to.clone().sub(tri.a).dot(tri.normal);
    if (c >= 0 || l <= -radius) continue;
    const u = c < -radius ? (-radius - c) / Math.max(1e-9, l - c) : 0;
    if (u > 1 || (best && u >= best.t)) continue;
    const point = from.clone().addScaledVector(motion, u);
    point.addScaledVector(tri.normal, -point.clone().sub(tri.a).dot(tri.normal));
    if (!triangleContainsPoint(point, tri.a, tri.b, tri.c)) {
      const closest = triangleClosestPoint(point, tri.a, tri.b, tri.c, new Vec3());
      if (closest.distanceToSquared(point) > 0.3 ** 2) continue;
      point.copy(closest);
    }
    best = { point, normal: tri.normal.clone().negate(), t: u, route: tri.route };
  }
  return best;
}
