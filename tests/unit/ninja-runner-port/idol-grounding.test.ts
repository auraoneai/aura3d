/**
 * Idol grounding sweep: every Idol district prop (houses, teahouses, towers, stalls, lanterns, pines, maples) and the
 * evening set pieces stand on the ground under their whole footprint — the base is at or below the terrain at the
 * footprint centre and rim, and never more than 0.5 m below the lowest terrain point there (no floating on a slope, no
 * burying). Rooftop-district houses deliberately built below the path (their roofs ARE the path) are listed separately.
 */
import { describe, expect, it } from "vitest";
import { COURSE_LENGTH, groundFrame } from "../../../examples/ninja-runner-port/course";
import { surfaceY } from "../../../examples/ninja-runner-port/meshes";
import { PLACEMENT_COURSE, buildProceduralCourseAccents, buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { IDOL_PROP_KEYS, idolAsset, idolPropTransform } from "../../../examples/ninja-runner-port/art/idolScenery";
import { shrineCentre } from "../../../examples/ninja-runner-port/setpieces";

/* world (x, z) -> course (distance, lateral): nearest route frame through a coarse spatial hash */
const STEP = 0.5, CELL = 16;
const frames: { d: number; x: number; z: number; rx: number; rz: number; fx: number; fz: number }[] = [];
const grid = new Map<string, number[]>();
for (let d = 0; d <= COURSE_LENGTH; d += STEP) {
  const f = groundFrame(d, 0);
  frames.push({ d, x: f.x, z: f.z, rx: -f.dz, rz: f.dx, fx: f.dx, fz: f.dz });
  const k = `${Math.floor(f.x / CELL)},${Math.floor(f.z / CELL)}`;
  (grid.get(k) ?? grid.set(k, []).get(k)!).push(frames.length - 1);
}
/** Course coordinates of a world point on the ribbon sheet nearest to height `y` (inner sides of tight bends fold). */
function toCourse(x: number, z: number, y?: number): { d: number; lat: number } | null {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best: { d: number; lat: number } | null = null, score = Infinity;
  for (let i = cx - 5; i <= cx + 5; i++) for (let j = cz - 5; j <= cz + 5; j++) {
    for (const k of grid.get(`${i},${j}`) ?? []) {
      const f = frames[k]!, along = (x - f.x) * f.fx + (z - f.z) * f.fz;
      if (Math.abs(along) > STEP * 0.75) continue;
      const lat = (x - f.x) * f.rx + (z - f.z) * f.rz;
      if (Math.abs(lat) > 80) continue;
      const c = { d: f.d + along, lat };
      const sc = y === undefined ? Math.abs(lat) : Math.abs(ground(c.d, c.lat) - y);
      if (sc < score) { score = sc; best = c; }
    }
  }
  return best;
}
/** The visible ground: the route surface and its verges, and the rooftop district's town floor (y 3.2, d 520-1030). */
const TOWN_FLOOR = { y: 3.2, from: 520, to: 1030, half: 130 };
function ground(d: number, lat: number): number {
  const y = surfaceY(Math.max(0, d), lat);
  return d >= TOWN_FLOOR.from && d <= TOWN_FLOOR.to && Math.abs(lat) <= TOWN_FLOOR.half ? Math.max(y, TOWN_FLOOR.y) : y;
}

function sweep() {
  const sink: ModelSink = {};
  buildScenery(sink, { paintedTrees: true });
  const accents = buildProceduralCourseAccents(shrineCentre());
  const rows: { id: string; base: number; lo: number; hi: number; centre: number; d: number; lat: number }[] = [];
  for (const [id, list] of Object.entries(sink)) {
    if (!(id in IDOL_PROP_KEYS)) continue;
    const key = IDOL_PROP_KEYS[id as keyof typeof IDOL_PROP_KEYS];
    const b = (idolAsset(key) as { bounds?: number[] } | undefined)?.bounds ?? [1, 1, 1];
    const all = id === "oak" ? [...(list ?? []), ...accents.sakuraMapleTrees] : (list ?? []);
    for (const p of all) {
      const t = idolPropTransform(id as keyof typeof IDOL_PROP_KEYS, p);
      const s = t.scale as readonly number[], pos = t.position as readonly number[], yaw = (t.rotation as readonly number[])[1]!;
      // trunk-sized footprint for trees and lanterns, the full plan (to the eaves) for buildings
      const tree = id === "pine" || id === "oak" || id === "lantern";
      const hx = (b[0]! * s[0]!) / 2 * (tree ? 0.12 : 1), hz = (b[2]! * s[2]!) / 2 * (tree ? 0.12 : 1);
      const c = PLACEMENT_COURSE.get(p) ?? toCourse(pos[0]!, pos[2]!, pos[1]! + 0.3);
      if (!c) continue;
      // footprint corners and edge midpoints (yawed plan) expressed along / across the course at the placement
      const f = groundFrame(c.d, 0);
      const pts: number[] = [];
      for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const lx = u * hx, lz = v * hz;
        const wx = lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
        pts.push(ground(c.d + wx * f.dx + wz * f.dz, c.lat + wx * -f.dz + wz * f.dx));
      }
      rows.push({ id, base: pos[1]!, lo: Math.min(...pts), hi: Math.max(...pts), centre: pts[0]!, d: c.d, lat: c.lat });
    }
  }
  return rows;
}

describe("Shadowstep Idol props sit on the ground", () => {
  const rows = sweep();
  it("sweeps the district", () => {
    expect(rows.length).toBeGreaterThan(50);
  });
  it("no prop floats above, or is buried more than 0.5 m below, the terrain under its footprint", () => {
    // Rooftop district (d 546-1004): the row houses, towers and courtyard trees stand on the town floor (y 3.2) and their
    // lower storeys are meant to be hidden under the falling verge; the roofs ARE the rooftop run.
    const sub = rows.filter((r) => r.d > 546 && r.d < 1004 && r.base > 3.2 - 0.6 && r.base <= 3.2);
    const bad = rows.filter((r) => !sub.includes(r) && (r.base > r.lo + 1e-3 || r.base < r.lo - 0.5));
    expect(sub.length).toBeLessThan(rows.length / 2);
    expect(bad).toEqual([]);
  });
});
