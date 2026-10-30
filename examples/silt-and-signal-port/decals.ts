/**
 * GU47 DG-W2: sand drifts, aqueduct water stains and lamp soot for the inked look (presentation only; the sim never
 * sees them).
 *
 * The engine's root decals (`decals.project`) cost one transparent draw each, and this game is already over its draw
 * budget in ch0, so the plan below is merged into ONE soft-edged transparent mesh (+1 draw): every decal is an ellipse
 * fan whose rim colour fades toward the surface tone, offset off its surface like a root decal. The count stays inside
 * the engine's per-route decal budget (`decals.maxDecals`, 32). Deterministic per chapter (mulberry32 seeded by the
 * chapter). Static, so reduced motion and reduced flash change nothing; the Low tier draws none.
 */
import { decals } from "@aura3d/engine";
import { isAqueduct, type ColoredMesh } from "./architecture";
import { CHAPTERS } from "./chapters-data";
import { PLAZA, roadX, usesOriginalTerrain, type Placement, type Terrain, type Wall } from "./terrain";
import { linearOf } from "./art/look";

export type SiltDecalKind = "drift" | "stain" | "soot";

/** One decal: an ellipse on the ground (normal +Y) or on a wall face (normal +-X or +-Z). */
export interface SiltDecal {
  readonly kind: SiltDecalKind;
  readonly centre: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  /** half extents along the surface: [across, along] (ground: across = x-ish after yaw; wall: horizontal, vertical) */
  readonly half: readonly [number, number];
  /** ground decals only: yaw of the long axis (radians) */
  readonly yaw: number;
  readonly color: string;
}

/** Per-kind caps; the sum (24) stays below the engine's 32-decal route budget. */
export const DECAL_CAPS: Readonly<Record<SiltDecalKind, number>> = { drift: 12, stain: 6, soot: 6 };
export const DECAL_BUDGET = decals.maxDecals;
/** Metres the ground decals float above the terrain height (the road ribbon sits at +0.07..0.08, the plaza at +0.02). */
export const DECAL_GROUND_LIFT = 0.14;
/** Metres the wall decals float off the wall face. */
export const DECAL_WALL_LIFT = 0.08;
/** Base opacity of the merged decal mesh (root decals default to 0.85; these are washes). */
export const DECAL_OPACITY = 0.6;

const DRIFT_DAY = "#ecd3a2", DRIFT_WET = "#7a6a55";
const STAIN = "#4b4a3a";
const SOOT = "#241c17";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The wall face a decal goes on: the long face toward `toward` (x, z). */
function wallFace(w: Wall, towardX: number, towardZ: number): { readonly normal: [number, number, number]; readonly x: number; readonly z: number; readonly width: number } {
  if (w.halfZ >= w.halfX) {
    const s = towardX >= w.x ? 1 : -1;
    return { normal: [s, 0, 0], x: w.x + s * (w.halfX + DECAL_WALL_LIFT), z: w.z, width: w.halfZ };
  }
  const s = towardZ >= w.z ? 1 : -1;
  return { normal: [0, 0, s], x: w.x, z: w.z + s * (w.halfZ + DECAL_WALL_LIFT), width: w.halfX };
}

/** Distance from (x, z) to the wall's footprint (0 inside). */
const wallDistance = (w: Wall, x: number, z: number): number => Math.hypot(Math.max(0, Math.abs(x - w.x) - w.halfX), Math.max(0, Math.abs(z - w.z) - w.halfZ));

export interface DecalPlanOptions {
  /** DG-S5 storm chapter: drifts are dark wet sand. */
  readonly wet?: boolean;
  /** PRD §6.4 Low tier: no decals (saves the draw). */
  readonly low?: boolean;
}

/** The chapter's decal plan: drifts along the route (and on the plaza in ch0/ch6), stains on aqueducts, soot over lamps. */
export function decalPlan(chapter: number, terrain: Pick<Terrain, "heightAt">, walls: readonly Wall[], lamps: readonly Placement[], options: DecalPlanOptions = {}): SiltDecal[] {
  if (options.low) return [];
  const rng = mulberry32(0xd3ca1 + chapter * 104729);
  const out: SiltDecal[] = [];
  const ground = (x: number, z: number): number => Math.max(0, terrain.heightAt(x, z)) + DECAL_GROUND_LIFT;
  const driftColor = options.wet ? DRIFT_WET : DRIFT_DAY;
  // a west breeze (DG-AN2 wind) piles drifts with their long axis roughly north-south across the road, jittered
  const drift = (x: number, z: number): void => {
    out.push({ kind: "drift", centre: [x, ground(x, z), z], normal: [0, 1, 0], half: [1.6 + rng() * 1.6, 4 + rng() * 4], yaw: (rng() - 0.5) * 0.7, color: driftColor });
  };
  if (usesOriginalTerrain(chapter)) {
    for (let i = 0; i < 4; i++) drift(PLAZA.x0 + 30 + rng() * (PLAZA.x1 - PLAZA.x0 - 60), PLAZA.z0 + 30 + rng() * (PLAZA.z1 - PLAZA.z0 - 60));
  }
  const rings = CHAPTERS[chapter]!.objectives.flatMap((o) => o.points);
  const span = Math.max(1, rings.length - 1);
  for (let i = 0; out.length < DECAL_CAPS.drift && i < DECAL_CAPS.drift * 2; i++) {
    // drifts on the road 20-80 m past a ring station
    const a = rings[Math.floor(rng() * span)];
    if (!a) break;
    const z = a.z - 20 - rng() * 60;
    drift(roadX(z) + (rng() - 0.5) * 8, z);
  }

  const stainWalls = walls.filter(isAqueduct).slice(0, DECAL_CAPS.stain);
  for (const w of stainWalls) {
    const face = wallFace(w, roadX(w.z), w.z + 1);
    const h = w.top - w.bottom;
    const along = (rng() - 0.5) * face.width;
    const x = face.normal[0] !== 0 ? face.x : face.x + along, z = face.normal[0] !== 0 ? face.z + along : face.z;
    // a tall streak from the foot of the wall: half-height up to a third of the wall
    const halfV = Math.min(h / 3, 6 + rng() * 4);
    const foot = Math.max(w.bottom, Math.max(0, terrain.heightAt(x, z)));
    out.push({ kind: "stain", centre: [x, foot + halfV, z], normal: face.normal, half: [1.2 + rng() * 1.2, halfV], yaw: 0, color: STAIN });
  }

  let soot = 0;
  for (const lamp of lamps) {
    if (soot >= DECAL_CAPS.soot) break;
    let best: Wall | undefined, bestD = 14;
    for (const w of walls) {
      const d = wallDistance(w, lamp.x, lamp.z);
      if (d > 0 && d < bestD) { best = w; bestD = d; }
    }
    if (!best) continue;
    const face = wallFace(best, lamp.x, lamp.z);
    const s = Math.max(2.2, lamp.scale);
    const y = Math.min(best.top - 1, lamp.y + 1.6 * s);
    if (y <= best.bottom + 1) continue;
    const x = face.normal[0] !== 0 ? face.x : Math.max(best.x - best.halfX + 1, Math.min(best.x + best.halfX - 1, lamp.x));
    const z = face.normal[0] !== 0 ? Math.max(best.z - best.halfZ + 1, Math.min(best.z + best.halfZ - 1, lamp.z)) : face.z;
    out.push({ kind: "soot", centre: [x, y, z], normal: face.normal, half: [1.1 + rng() * 0.5, 1.6 + rng() * 0.8], yaw: 0, color: SOOT });
    soot += 1;
  }
  return out.slice(0, DECAL_BUDGET);
}

/** Ring segments of each ellipse fan. */
export const DECAL_SEGMENTS = 20;
/** Rim colour mix toward the surface tone (1 = rim fully the surface tone): the soft edge of a one-opacity mesh. */
const RIM_FADE = 0.85;

/**
 * Merge the plan into one mesh: per decal a centre vertex, a mid ring (full decal colour) and a rim (faded toward the
 * surface tone). Ground decals follow the terrain at every vertex.
 */
export function decalMesh(plan: readonly SiltDecal[], terrain: Pick<Terrain, "heightAt">, surfaceTone: string): ColoredMesh {
  const m: ColoredMesh = { positions: [], normals: [], uvs: [], indices: [], colors: [] };
  const tone = linearOf(surfaceTone);
  for (const d of plan) {
    const c = linearOf(d.color);
    const rim: [number, number, number] = [c[0] + (tone[0] - c[0]) * RIM_FADE, c[1] + (tone[1] - c[1]) * RIM_FADE, c[2] + (tone[2] - c[2]) * RIM_FADE];
    const base = m.positions.length / 3;
    const ground = d.normal[1] !== 0;
    const point = (u: number, v: number): [number, number, number] => {
      if (ground) {
        const cy = Math.cos(d.yaw), sy = Math.sin(d.yaw);
        const x = d.centre[0] + u * cy - v * sy, z = d.centre[2] + u * sy + v * cy;
        return [x, Math.max(0, terrain.heightAt(x, z)) + DECAL_GROUND_LIFT, z];
      }
      // wall: u along the face (horizontal), v vertical
      return d.normal[0] !== 0 ? [d.centre[0], d.centre[1] + v, d.centre[2] + u] : [d.centre[0] + u, d.centre[1] + v, d.centre[2]];
    };
    const push = (p: readonly [number, number, number], col: readonly [number, number, number], uv: readonly [number, number]): void => {
      m.positions.push(p[0], p[1], p[2]);
      m.normals.push(d.normal[0], d.normal[1], d.normal[2]);
      m.uvs.push(uv[0], uv[1]);
      m.colors.push(col[0], col[1], col[2]);
    };
    push(ground ? point(0, 0) : [d.centre[0], d.centre[1], d.centre[2]], c, [0.5, 0.5]);
    for (const [ring, col] of [[0.55, c], [1, rim]] as const) {
      for (let i = 0; i < DECAL_SEGMENTS; i++) {
        const a = (i / DECAL_SEGMENTS) * Math.PI * 2, cu = Math.cos(a) * ring, sv = Math.sin(a) * ring;
        push(point(cu * d.half[0], sv * d.half[1]), col, [0.5 + cu * 0.5, 0.5 + sv * 0.5]);
      }
    }
    // (centre, i, i+1) faces -Y on the ground, -X on x walls and +Z on z walls: flip where the decal faces the other way
    const flip = ground || d.normal[0] > 0 || d.normal[2] < 0;
    const tri = (a: number, b: number, c: number): void => { if (flip) m.indices.push(a, c, b); else m.indices.push(a, b, c); };
    const mid = base + 1, outer = base + 1 + DECAL_SEGMENTS;
    for (let i = 0; i < DECAL_SEGMENTS; i++) {
      const j = (i + 1) % DECAL_SEGMENTS;
      tri(base, mid + i, mid + j);
      tri(mid + i, outer + i, outer + j);
      tri(mid + i, outer + j, mid + j);
    }
  }
  return m;
}
