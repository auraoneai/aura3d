/**
 * Pass-through sweep (owner, 2026-11-18: "the guy just goes right through a pole rather than hitting against it").
 *
 * 1. Decor: no district prop, course accent, set piece or procedural scenery box stands in the runner's corridor. The
 *    corridor at course distance d is every lateral offset the runner's body can reach (outer lane centre
 *    `laneOffset(d)` plus the body half-width) from the path surface up to a full jump (apex 2.16 m + 1.75 m body). Decor
 *    has no collider in the sim (a deterministic port), so it must stay out of that space: trees/rocks/bushes use
 *    their trunk/crown/boulder circles, buildings, lanterns and stalls their full yawed plan, gates their two pillars.
 * 2. Hazards: the sim hits the runner when its centre is within `HIT_HALF` (0.88 m) of the hazard's lane centre, and
 *    a barrier is cleared above 0.85 m; the drawn crate / beam must match that box (within a tolerance), so the runner
 *    neither visibly runs through the edge of a hazard it missed, nor jumps "through" the top of a crate it cleared.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COURSE_LENGTH, groundFrame, laneOffset } from "../../../examples/ninja-runner-port/course";
import { surfaceY } from "../../../examples/ninja-runner-port/meshes";
import { MESHY_MANIFEST } from "../../../examples/ninja-runner-port/assets/meshy/manifest";
import { buildProceduralCourseAccents, buildScenery, type ModelPlacement, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { IDOL_BARRIER_SCALE, IDOL_PROP_KEYS, idolAsset, idolPropTransform } from "../../../examples/ninja-runner-port/art/idolScenery";
import { BEAM_DRAWN, BEAM_SCALE_X, BEAM_AUTHORED_WIDTH, HAZARD_HIT } from "../../../examples/ninja-runner-port/hazards";
import { eveningSetPieces, SET_PIECE_BOUNDS, shrineCentre } from "../../../examples/ninja-runner-port/setpieces";

const RUNNER_HALF = 0.35;
const REACH_UP = 2.16 + 1.75;

/* world (x, z) -> every course point whose cross-section passes through it (tight bends can fold over each other) */
const STEP = 0.5, CELL = 16;
const frames: { d: number; x: number; z: number; rx: number; rz: number; fx: number; fz: number }[] = [];
const grid = new Map<string, number[]>();
for (let d = 0; d <= COURSE_LENGTH; d += STEP) {
  const f = groundFrame(d, 0);
  frames.push({ d, x: f.x, z: f.z, rx: -f.dz, rz: f.dx, fx: f.dx, fz: f.dz });
  const k = `${Math.floor(f.x / CELL)},${Math.floor(f.z / CELL)}`;
  (grid.get(k) ?? grid.set(k, []).get(k)!).push(frames.length - 1);
}
function courseHits(x: number, z: number): { d: number; lat: number }[] {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), out: { d: number; lat: number }[] = [];
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const k of grid.get(`${i},${j}`) ?? []) {
    const f = frames[k]!, along = (x - f.x) * f.fx + (z - f.z) * f.fz;
    if (Math.abs(along) > STEP * 0.6) continue;
    const lat = (x - f.x) * f.rx + (z - f.z) * f.rz;
    if (Math.abs(lat) < 8) out.push({ d: f.d + along, lat });
  }
  return out;
}

interface Hit { id: string; d: number; lat: number; pen: number }
/** Deepest corridor intrusion of a plan sample set spanning heights [y0, y1]; null when clear. */
function intrusion(id: string, pts: readonly (readonly [number, number])[], y0: number, y1: number): Hit | null {
  let worst: Hit | null = null;
  for (const [x, z] of pts) for (const c of courseHits(x, z)) {
    const pen = laneOffset(Math.max(0, c.d)) + RUNNER_HALF - Math.abs(c.lat);
    if (pen <= 0) continue;
    const g = surfaceY(Math.max(0, Math.min(COURSE_LENGTH, c.d)), c.lat);
    if (y1 < g + 0.35 || y0 > g + REACH_UP) continue; // walk-over lips / overhead
    if (!worst || pen > worst.pen) worst = { id, d: Math.round(c.d * 10) / 10, lat: Math.round(c.lat * 100) / 100, pen: Math.round(pen * 100) / 100 };
  }
  return worst;
}
const boxPts = (cx: number, cz: number, yaw: number, hx: number, hz: number, n = 6): [number, number][] => {
  const out: [number, number][] = [];
  for (let u = -n; u <= n; u++) for (let v = -n; v <= n; v++) {
    const lx = (u / n) * hx, lz = (v / n) * hz;
    out.push([cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
  }
  return out;
};
const circlePts = (cx: number, cz: number, r: number): [number, number][] => {
  const out: [number, number][] = [[cx, cz]];
  for (const k of [0.5, 1]) for (let a = 0; a < 16; a++) out.push([cx + Math.cos((a / 16) * Math.PI * 2) * r * k, cz + Math.sin((a / 16) * Math.PI * 2) * r * k]);
  return out;
};

/** Drawn half extents (x, z), height and base of a district model placement (Idol model when admitted). */
function drawn(id: string, p: ModelPlacement): { hx: number; hz: number; h: number; base: [number, number, number] } {
  const key = IDOL_PROP_KEYS[id as keyof typeof IDOL_PROP_KEYS];
  const b = key ? (idolAsset(key) as { bounds?: number[] } | undefined)?.bounds : undefined;
  if (key && b) {
    const t = idolPropTransform(id as keyof typeof IDOL_PROP_KEYS, p);
    const s = t.scale as readonly number[];
    return { hx: (b[0]! * s[0]!) / 2, hz: (b[2]! * s[2]!) / 2, h: b[1]! * s[1]!, base: t.position as [number, number, number] };
  }
  const m = (MESHY_MANIFEST as Record<string, { size: readonly number[] }>)[id]!.size;
  return { hx: (m[0]! * p.scale[0]) / 2, hz: (m[2]! * p.scale[2]) / 2, h: m[1]! * p.scale[1], base: p.position };
}

function sweep(): Hit[] {
  const sink: ModelSink = {};
  const layers = buildScenery(sink, { paintedTrees: true });
  const accents = buildProceduralCourseAccents(shrineCentre());
  const hits: Hit[] = [];
  const add = (h: Hit | null): void => { if (h) hits.push(h); };
  for (const [id, list] of Object.entries(sink)) {
    const all = id === "oak" ? [...list, ...accents.sakuraMapleTrees] : list;
    for (const p of all) {
      const { hx, hz, h, base } = drawn(id, p);
      const [x, y, z] = base;
      if (id === "pine" || id === "oak") {
        add(intrusion(`${id}-trunk`, circlePts(x, z, Math.min(hx, hz) * 0.15), y, y + h * 0.4));
        add(intrusion(`${id}-crown`, circlePts(x, z, Math.min(hx, hz) * 0.85), y + h * 0.4, y + h));
      } else if (id === "boulder" || id === "bush") {
        add(intrusion(id, circlePts(x, z, Math.min(hx, hz) * 0.9), y, y + h));
      } else if (id === "gate") {
        // a torii: two pillars (native +-0.68 of a 1.98 m span, base radius 0.23); the lintels pass ~10 m overhead
        for (const s of [-1, 1]) {
          const lx = s * hx * (0.68 / 0.99);
          add(intrusion("gate-pillar", circlePts(x + lx * Math.cos(p.yaw), z - lx * Math.sin(p.yaw), hx * (0.23 / 0.99)), y, y + h * 0.7));
        }
      } else if (id !== "ridge" && id !== "cliffA" && id !== "cliffB") {
        add(intrusion(id, boxPts(x, z, p.yaw, hx, hz), y, y + h));
      }
    }
  }
  const ACCENT_SIZE: Record<string, readonly [number, number, number]> = {
    bambooGroves: [1.4, 3.8, 1.4], ishigakiRamparts: [4.8, 2.7, 1.6], rooftopToroLanterns: [1, 2.2, 1],
    rooftopShrineRailings: [0.2, 1.05, 5.9], rooftopRidgeTiles: [0.62, 0.32, 5.92]
  };
  for (const [k, list] of Object.entries(accents)) {
    const sz = ACCENT_SIZE[k];
    if (!sz) continue; // bridge arches carry the deck from below; maples are swept with the district oaks
    for (const p of list as ModelPlacement[]) add(intrusion(k, boxPts(p.position[0], p.position[2], p.yaw, (sz[0] * p.scale[0]) / 2, (sz[2] * p.scale[2]) / 2), p.position[1], p.position[1] + sz[1] * p.scale[1]));
  }
  for (const [id, list] of Object.entries(eveningSetPieces())) {
    const b = SET_PIECE_BOUNDS[id as keyof typeof SET_PIECE_BOUNDS];
    for (const p of list) add(intrusion(id, boxPts(p.position[0], p.position[2], p.yaw, (b.size[0] * p.scale[0]) / 2, (b.size[2] * p.scale[2]) / 2), p.position[1] - b.lift * p.scale[1], p.position[1] - b.lift * p.scale[1] + b.size[1] * p.scale[1]));
  }
  for (const l of layers) {
    if (l.id === "slabs") continue; // the path's own deck / roof boards
    for (const pl of l.placements) {
      const m = pl.matrix;
      const sx = Math.hypot(m[0]!, m[2]!), sz = Math.hypot(m[8]!, m[10]!), yaw = Math.atan2(-m[2]!, m[0]!);
      const round = l.shape === "cylinder" || l.shape === "cone" || l.shape === "sphere";
      add(intrusion(`layer-${l.id}`, round ? circlePts(m[12]!, m[14]!, Math.max(sx, sz)) : boxPts(m[12]!, m[14]!, yaw, sx / 2, sz / 2), m[13]!, m[13]! + m[5]!));
    }
  }
  return hits;
}

describe("Shadowstep: nothing solid stands where the runner runs", () => {
  it("no decor footprint intersects the runner's corridor (lanes + body, path surface to jump apex)", () => {
    // tolerance 5 cm: soft bush leaves brushing the outer-lane shoulder
    const bad = sweep().filter((h) => h.pen > 0.05);
    expect(bad).toEqual([]);
  });
});

describe("Shadowstep: hazards look as big as they hit", () => {
  it("crate barrier: drawn half-width + runner half-width ~ the sim's lateral hit radius; drawn height ~ the jump clearance", () => {
    const b = (idolAsset("nrBarricade") as { bounds?: number[] } | undefined)?.bounds;
    expect(b).toBeDefined();
    const half = (b![0]! * IDOL_BARRIER_SCALE[0]) / 2, height = b![1]! * IDOL_BARRIER_SCALE[1];
    expect(Math.abs(half + RUNNER_HALF - HAZARD_HIT.half)).toBeLessThan(0.2);
    expect(Math.abs(height - HAZARD_HIT.barrierClear)).toBeLessThan(0.15);
    // the idol crate keeps its carved proportions
    expect(Math.max(...IDOL_BARRIER_SCALE) / Math.min(...IDOL_BARRIER_SCALE)).toBeLessThan(1.33);
    // the hit box is the one sim.ts uses
    const sim = readFileSync(fileURLToPath(new URL("../../../examples/ninja-runner-port/sim.ts", import.meta.url)), "utf8");
    expect(sim).toContain(`o < ${HAZARD_HIT.half} &&`);
    expect(sim).toContain(`r.type === "barrier" ? i.y > ${HAZARD_HIT.barrierClear}`);
  });
  it("spiked beam: drawn half-width + runner half-width ~ the sim's lateral hit radius", () => {
    expect(Math.abs(BEAM_DRAWN.half + RUNNER_HALF - HAZARD_HIT.half)).toBeLessThan(0.2);
    expect(BEAM_SCALE_X * BEAM_AUTHORED_WIDTH).toBeCloseTo(BEAM_DRAWN.half * 2, 6);
    const world = readFileSync(fileURLToPath(new URL("../../../examples/ninja-runner-port/world.ts", import.meta.url)), "utf8");
    expect(world).toContain("h.setScale([BEAM_SCALE_X, 1, 1])");
  });
  it("a hazard in one lane never visibly reaches a runner in the next lane, at the narrowest lane spacing", () => {
    let minLane = Infinity;
    for (let d = 0; d <= COURSE_LENGTH; d += 1) minLane = Math.min(minLane, laneOffset(d));
    const b = (idolAsset("nrBarricade") as { bounds?: number[] } | undefined)!.bounds!;
    const crateHalf = (b[0]! * IDOL_BARRIER_SCALE[0]) / 2;
    expect(crateHalf + RUNNER_HALF).toBeLessThan(minLane);
    expect(BEAM_DRAWN.half + RUNNER_HALF).toBeLessThan(minLane);
  });
});
