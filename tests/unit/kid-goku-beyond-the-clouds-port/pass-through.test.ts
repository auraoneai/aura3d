/**
 * Pass-through audit (owner, 2026-11-18: "the guy just goes right through a pole"). The runner's reachable volume is the
 * corridor |lane| <= 5.1 (sim.ts clamp) plus the kid's half-width, from the road surface up to the highest the kid
 * reaches (a jump apex 3.6 m, the pole vault 5 m, the Glider 3.2 m + cloud hop, plus his 1.54 m height). Nothing in it
 * is drawn without a collider:
 *  - decor (procedural merged meshes and the Idol roadside / gate / cottage models at their measured GLB extents)
 *    keeps its whole visual volume out of the corridor;
 *  - the hazards' drawn volume matches what the sim / encounter layer hits: rocks and logs (sim.ts `worldPass`) and the
 *    rolling boulders (encounters.ts) are drawn the size of their hitbox, so a hit touches and a miss is a visible miss.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { at, frameAt, type V3 } from "../../../examples/kid-goku-beyond-the-clouds-port/course";
import { BOULDER_RADIUS, Encounters, RUNNER_HALF_WIDTH, RUNNER_HEIGHT } from "../../../examples/kid-goku-beyond-the-clouds-port/encounters";
import { IDOL_BANDS, IDOL_FOOTPRINT, groundCottageY, groundRoadside } from "../../../examples/kid-goku-beyond-the-clouds-port/art/idolGrounding";
import { RIDE_LOG, RIDE_LOG_TOP, SHRINE_PILLAR_X } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";
import { appendGroundShadows, BOULDER_SHADOW, SHADE_GRID, SHADE_MAX_SLOPE, TREE_SHADOW } from "../../../examples/kid-goku-beyond-the-clouds-port/groundShadows";
import { ACTIVE_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { Mesh } from "../../../examples/kid-goku-beyond-the-clouds-port/mesh";
import { buildBridges, buildGorgePosts, buildHut, buildMesas, buildObstacles, buildSanctuaryToriiPlacements } from "../../../examples/kid-goku-beyond-the-clouds-port/props";
import { layoutObstacles, OBSTACLE_JUMP_CLEAR, OBSTACLE_REACH } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";
import { BLOB_TREE_CLEAR, CORRIDOR_HALF, HERO_TREE_SPACING, REACH_HEIGHT, ROAD_HALF, buildScatter, buildValleyForest, groundHeight } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";
import { buildWaymarks } from "../../../examples/kid-goku-beyond-the-clouds-port/waymarks";


/** Course coordinates of a world point: distance s, lateral offset, height above the road centre. */
function course(p: V3): { s: number; lat: number; h: number } {
  let s = -p[2];
  for (let k = 0; k < 4; k++) {
    const f = frameAt(s);
    s += (p[0] - f.point[0]) * f.forward[0] + (p[1] - f.point[1]) * f.forward[1] + (p[2] - f.point[2]) * f.forward[2];
  }
  const f = frameAt(s);
  const d: V3 = [p[0] - f.point[0], p[1] - f.point[1], p[2] - f.point[2]];
  return { s, lat: d[0] * f.right[0] + d[1] * f.right[1] + d[2] * f.right[2], h: d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2] };
}

/** Triangles of `m` with any part inside the corridor volume (vertices and triangle centroids are sampled). */
function intrusions(m: Mesh, label: string): string[] {
  const out: string[] = [];
  const P = (i: number): V3 => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
  const inside = (p: V3): { s: number; lat: number; h: number } | null => {
    const c = course(p);
    return Math.abs(c.lat) < CORRIDOR_HALF && c.h > 0.08 && c.h < REACH_HEIGHT ? c : null;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = P(m.indices[t]!), b = P(m.indices[t + 1]!), c = P(m.indices[t + 2]!);
    const g: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const hit = inside(a) ?? inside(b) ?? inside(c) ?? inside(g);
    if (hit) out.push(`${label} s=${Math.round(hit.s)} lat=${hit.lat.toFixed(1)} h=${hit.h.toFixed(1)}`);
  }
  return [...new Set(out.map((x) => x.replace(/ lat=.*$/, "")))].map((k) => out.find((x) => x.startsWith(k + " "))!);
}

describe("Cumulus Dash: nothing solid-looking stands in the runner's corridor without a collider", () => {
  const scatter = buildScatter(CH);

  it("the corridor is the sim's lane clamp plus the kid's half-width", () => expect(CORRIDOR_HALF).toBeCloseTo(5.1 + RUNNER_HALF_WIDTH, 6));

  it("procedural decor (trees, bushes, rocks, curbs, gorge posts, bridges, waymarks, mesas, the hut) stays out of the corridor", () => {
    const hits: string[] = [];
    scatter.trees.forEach((m, i) => hits.push(...intrusions(m, `trees-${i}`)));
    scatter.nearTrees.forEach((m, i) => hits.push(...intrusions(m, `near-trees-${i}`)));
    scatter.bushes.forEach((m, i) => hits.push(...intrusions(m, `bushes-${i}`)));
    scatter.rocks.forEach((m, i) => hits.push(...intrusions(m, `rocks-${i}`)));
    hits.push(...intrusions(buildBridges(CH), "bridges"));
    hits.push(...intrusions(buildGorgePosts(CH), "gorge-posts"));
    hits.push(...intrusions(buildWaymarks(CH), "waymarks"));
    buildMesas(CH).meshes.forEach((m, i) => hits.push(...intrusions(m, `mesas-${i}`)));
    buildValleyForest(CH).forEach((m, i) => hits.push(...intrusions(m, `valley-forest-${i}`)));
    const hut = buildHut(CH);
    if (hut) hits.push(...intrusions(hut, "hut"));
    expect(hits).toEqual([]);
  }, 120_000);

  it.each([["round", "roundTrees"], ["pine", "pineTrees"], ["rock", "boulders"]] as const)("Idol %s models keep every height band out of the corridor", (kind, key) => {
    const bad: string[] = [];
    for (const p of groundRoadside(CH, scatter[key], kind)) {
      const s = p.s!, base = course(p.pos);
      IDOL_BANDS[kind].forEach((r, q) => {
        const h0 = base.h + (p.scale * q) / 10, h1 = base.h + (p.scale * (q + 1)) / 10;
        if (h1 < 0.08 || h0 > REACH_HEIGHT) return;
        if (Math.abs(base.lat) - r * p.scale < CORRIDOR_HALF) bad.push(`${kind} s=${s.toFixed(1)} lat=${base.lat.toFixed(2)} band ${q} r=${(r * p.scale).toFixed(2)} h=${h0.toFixed(1)}`);
      });
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it("the shrine-gate pillars (bell bracket toward the road) and the hermit cottage stand outside the corridor", () => {
    // pillar GLB: 0.29 x 7.65 m root scale = 2.2 m widest radius at the roof cap and bracket
    const pillarReach = 0.29 * 7.654;
    expect(SHRINE_PILLAR_X - pillarReach).toBeGreaterThan(CORRIDOR_HALF);
    expect(buildSanctuaryToriiPlacements(CH).length).toBeGreaterThan(0);
    // cottage GLB: 0.69 x 5.0 m root scale = 3.45 m widest radius (plinth and eaves)
    const home = CH.home!;
    expect(9.5 - 0.69 * 5.0).toBeGreaterThan(CORRIDOR_HALF);
    expect(Number.isFinite(groundCottageY(CH, home.s, 9.5))).toBe(true);
    expect(IDOL_FOOTPRINT.cottage).toBeLessThan(0.69 * 5.0);
  });

  it("every rock and log obstacle is drawn the size of its sim hitbox", () => {
    const meshes = buildObstacles(CH);
    const all = new Mesh();
    meshes.forEach((m) => all.append(m, [0, 0, 0]));
    const P = (i: number): V3 => [all.positions[i * 3]!, all.positions[i * 3 + 1]!, all.positions[i * 3 + 2]!];
    const pts = Array.from({ length: all.vertexCount }, (_, i) => course(P(i)));
    for (const o of layoutObstacles(CH, 0)) {
      const mine = pts.filter((p) => Math.abs(p.s - o.s) < 3.2 && Math.abs(p.lat - o.lane) < 4);
      expect(mine.length).toBeGreaterThan(0);
      const half = Math.max(...mine.map((p) => Math.abs(p.lat - o.lane)));
      const top = Math.max(...mine.map((p) => p.h - groundHeight(CH, p.s, 0)));
      // the sim hits when |lane delta| < reach: the drawn half-width plus the kid's half-width is that reach (+-0.25 m)
      expect(Math.abs(half + RUNNER_HALF_WIDTH - OBSTACLE_REACH[o.type === "log" ? "log" : "rock"])).toBeLessThan(0.25);
      // a jump clears it once the feet are above OBSTACLE_JUMP_CLEAR: the drawn top sits there (+-0.25 m)
      expect(Math.abs(top - OBSTACLE_JUMP_CLEAR)).toBeLessThan(0.25);
    }
  });

  it("the rolling boulder hits exactly when the kid's body touches the drawn ball, and a timed jump clears it", () => {
    const enc = new Encounters(CH);
    const b = enc.boulders[0]!;
    const run = (lane: number, jumpAt: number | null): boolean => {
      enc.rewind(b.s - 70);
      const state = { s: b.s - 70, lane, jump: 0, jumpVelocity: 0 };
      let hit = false;
      for (let i = 0; i < 600 && state.s < b.s + 8; i++) {
        const dt = 1 / 120;
        state.s += 14.5 * dt;
        if (jumpAt !== null && state.s - b.s >= jumpAt && state.jump === 0 && state.jumpVelocity === 0) state.jumpVelocity = 13.4;
        if (state.jumpVelocity !== 0 || state.jump > 0) { state.jumpVelocity -= 25 * dt; state.jump = Math.max(0, state.jump + state.jumpVelocity * dt); if (state.jump === 0) state.jumpVelocity = 0; }
        if (enc.boulderContact(b, state.s, state.lane, state.jump)) hit = true;
      }
      return hit;
    };
    expect(run(0, null)).toBe(true);
    expect(run(0, -6)).toBe(false);
    // a grounded kid level with the ball's centre is hit only when his body reaches it
    const laneAtCross = enc.boulderLane(b, b.s);
    expect(run(laneAtCross + BOULDER_RADIUS + RUNNER_HALF_WIDTH + 0.6, null)).toBe(false);
    expect(BOULDER_RADIUS * 2).toBeGreaterThan(RUNNER_HEIGHT); // still a boulder, taller than the kid
  });
  it("the chase camera's whole path lies inside the corridor that decor keeps clear, so no crown or blob encloses it", () => {
    // world.ts playing camera: 7.4 m behind at lateral lane x 0.65, 3.3 m up (+ jump x 0.35, + 0.6 on the cloud, + half
    // the log lift; portrait screens follow 0.9 of the lane and pull back 2.5 m and rise 2 m during the log ride, still over the road)
    const eyeLat = 5.1 * 0.9, eyeTop = 3.3 + 5 * 0.35 + 0.6 + RIDE_LOG_TOP * 0.5;
    expect(eyeLat).toBeLessThan(CORRIDOR_HALF);
    expect(eyeTop).toBeLessThan(REACH_HEIGHT);
    const crownsNear = (p: { s?: number; lat?: number; scale: number; pos: V3 }, kind: keyof typeof IDOL_BANDS): number => {
      const base = course(p.pos);
      return Math.min(...IDOL_BANDS[kind].map((r) => Math.abs(base.lat) - r * p.scale));
    };
    for (const [kind, key] of [["round", "roundTrees"], ["pine", "pineTrees"]] as const) {
      for (const p of groundRoadside(CH, scatter[key], kind)) expect(crownsNear(p, kind)).toBeGreaterThanOrEqual(CORRIDOR_HALF - 1e-9);
    }
  });

  it("no ground shade stands up as a dark sheet over a wall edge or cliff (the GPU 'black hole' beside the wall tops)", () => {
    const gf = {
      forwardXZ: (s: number): [number, number] => { const f = frameAt(s).forward; const l = Math.hypot(f[0], f[2]) || 1; return [f[0] / l, f[2] / l]; },
      groundAt: (s: number, lat: number): V3 => at(s, lat, groundHeight(CH, s, lat) + 0.06)
    };
    const m = new Mesh();
    const trees = [...groundRoadside(CH, scatter.roundTrees, "round"), ...groundRoadside(CH, scatter.pineTrees, "pine")];
    appendGroundShadows(m, trees, ACTIVE_LOOK.scenery.sunDir, TREE_SHADOW, gf);
    appendGroundShadows(m, groundRoadside(CH, scatter.boulders, "rock"), ACTIVE_LOOK.scenery.sunDir, BOULDER_SHADOW, gf);
    const per = SHADE_GRID * SHADE_GRID;
    expect(m.vertexCount % per).toBe(0);
    expect(m.vertexCount / per).toBeGreaterThan(trees.length * 0.5); // most trees still cast one
    let worst = 0;
    for (let b = 0; b < m.vertexCount; b += per) {
      const ys = Array.from({ length: per }, (_, k) => m.positions[(b + k) * 3 + 1]!);
      const xs = Array.from({ length: per }, (_, k) => [m.positions[(b + k) * 3]!, m.positions[(b + k) * 3 + 2]!] as const);
      for (let k = 0; k < per; k++) for (const o of [k % SHADE_GRID < SHADE_GRID - 1 ? k + 1 : -1, k + SHADE_GRID < per ? k + SHADE_GRID : -1]) {
        if (o < 0) continue;
        worst = Math.max(worst, Math.abs(ys[o]! - ys[k]!) / Math.hypot(xs[o]![0] - xs[k]![0], xs[o]![1] - xs[k]![1]));
      }
    }
    expect(worst).toBeLessThanOrEqual(SHADE_MAX_SLOPE);
  });

  it("the kid rides ON the rolling log (feet on its bark top) and is drawn from the first frame of the run", () => {
    expect(RIDE_LOG_TOP).toBeCloseTo(1.0 + RIDE_LOG.axisY * (RIDE_LOG.targetLength / RIDE_LOG.length), 6);
    expect(RIDE_LOG_TOP).toBeGreaterThan(1.9 + 0.05);
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toContain("const logLift = (IDOL ? RIDE_LOG_TOP : 1.9) * onLog;");
    expect(src).toContain("const hurtBlink = s.invincible > 0 && s.time > 1.05;");
  });
  it("the Idol look draws no low-poly blob tree within the band the chase camera sees, and its 150 Idol trees line the whole ridge", () => {
    // every vertex of the low-poly trees still drawn with the Idol models (`trees`) stands beyond the band, less the
    // widest procedural crown (0.68 x 10.4 m tree x icosphere jitter)
    let nearest = Infinity;
    for (const m of scatter.trees) for (let i = 0; i < m.vertexCount; i++) {
      nearest = Math.min(nearest, Math.abs(course([m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!]).lat) - ROAD_HALF);
    }
    expect(nearest).toBeGreaterThan(BLOB_TREE_CLEAR - 9);
    expect(scatter.nearTrees.length).toBeGreaterThan(0); // the near ones exist, for the procedural kit only
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toContain("if (!IDOL) scatter.nearTrees.forEach(");
    // spread: both sides carry Idol trees to the end of the ridge with no long bare stretch
    for (const side of [-1, 1]) {
      const ss = [...scatter.roundTrees, ...scatter.pineTrees].filter((p) => Math.sign(p.lat!) === side).map((p) => p.s!).sort((a, b) => a - b);
      expect(ss[ss.length - 1]!).toBeGreaterThan(CH.length - 200);
      for (let k = 1; k < ss.length; k++) expect(ss[k]! - ss[k - 1]!).toBeGreaterThanOrEqual(HERO_TREE_SPACING);
      const gaps = ss.slice(1).map((v, k) => v - ss[k]!).sort((a, b) => b - a);
      expect(gaps[0]!).toBeLessThan(160);
    }
  });
});
