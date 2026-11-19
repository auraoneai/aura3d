/**
 * Owner requirement: the golf ball never visibly flies or rolls through a tree, and the flagstick stops a ball that hits
 * it. The sim sees the same tree list the renderer draws (game/treeSpots.ts), each tree as a trunk + canopy collider
 * measured from its drawn model, minus the trees the shot camera clearance hides for that shot.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIdolTreeBatches } from "../../../apps/showcase-aura-links-3d/src/art/idolModels";
import { buildCourseTreeBatches } from "../../../apps/showcase-aura-links-3d/src/art/proceduralModels";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { idolBroadleafKey, treeIsBroadleaf } from "../../../apps/showcase-aura-links-3d/src/game/idolArt";
import { CLUBS, launchBall, makeRng, predictLanding, stepBall } from "../../../apps/showcase-aura-links-3d/src/game/sim";
import { canopyClearance, treesBlockingShot } from "../../../apps/showcase-aura-links-3d/src/game/treeClearance";
import {
  IDOL_TREE_COLLIDER, PROC_TREE_COLLIDER, PROC_TREE_SCALE_DIV, courseTreeSpots, holeSceneSeed, treeColliders, visibleTreeColliders
} from "../../../apps/showcase-aura-links-3d/src/game/treeSpots";
import type { BallState, CourseId, HoleTerrain, ShotEnv, TreeObstacle, Vec3 } from "../../../apps/showcase-aura-links-3d/src/game/types";

const json = (n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n);
const course = COURSES[Object.keys(COURSES)[0] as CourseId];
const hole = course.holes[0]!;
const terrain = buildHoleTerrain(course, hole);

const envOf = (t: HoleTerrain, extra: Partial<ShotEnv> = {}): ShotEnv => ({
  terrain: t, gravity: 9.81, airDensity: 1, wind: { speed: 0, yaw: 0 }, lie: "fairway", liePenalty: 1, ...extra
});

/** run a ball to rest, recording every position */
function play(ball: BallState, env: ShotEnv, seconds = 40): { end: BallState; path: Vec3[]; trees: number } {
  const path: Vec3[] = [ball.pos];
  let trees = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const r = stepBall(ball, env, 1 / 60);
    ball = r.ball;
    trees += r.events.filter((e) => e.kind === "tree").length;
    path.push(ball.pos);
    if (ball.status !== "flight" && ball.status !== "roll") break;
  }
  return { end: ball, path, trees };
}

/** distance along the unit direction (dx,dz) from (ax,az) */
const along = (p: Vec3, ax: number, az: number, dx: number, dz: number) => (p[0] - ax) * dx + (p[2] - az) * dz;

describe("trees stop the ball (no pass-through)", () => {
  const tee = terrain.tee;
  const yaw = terrain.lineYaw;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);

  it("a drive straight at a trunk never ends up beyond the tree", () => {
    const d = 30;
    const tx = tee[0] + dx * d, tz = tee[2] + dz * d;
    // a bare pole of a trunk, as tall as the flight (no canopy to slow it first)
    const trunk: TreeObstacle = { x: tx, z: tz, trunkR: 0.35, canopyR: 0, canopyY0: 0, canopyY1: 200 };
    const ball = launchBall({ club: CLUBS.driver, power: 1, accuracy: 0, spin: 0, aimYaw: yaw }, envOf(terrain));
    const free = play(ball, envOf(terrain));
    expect(along(free.end.pos, tee[0], tee[2], dx, dz)).toBeGreaterThan(d + 50); // sanity: without the tree it flies on
    const hit = play(ball, envOf(terrain, { obstacles: [trunk] }));
    expect(hit.trees).toBeGreaterThan(0);
    for (const p of hit.path) expect(along(p, tee[0], tee[2], dx, dz)).toBeLessThan(d);
    // and a rolling ball (a putt into a trunk) bounces back off it too
    const putt: BallState = { pos: [tx - dx * 4, terrain.height(tx - dx * 4, tz - dz * 4), tz - dz * 4], vel: [dx * 6, 0, dz * 6], curve: 0, backspin: 0, status: "roll", carry: 0, bounces: 0 };
    const rolled = play(putt, envOf(terrain, { obstacles: [trunk] }));
    for (const p of rolled.path) expect(along(p, tx, tz, dx, dz)).toBeLessThan(-0.35);
  });

  it("a ball through a canopy loses most of its speed and drops out under the tree, never out of its far side at speed", () => {
    const d = 40;
    const tx = tee[0] + dx * d, tz = tee[2] + dz * d;
    const ground = terrain.height(tx, tz);
    const canopy: TreeObstacle = { x: tx, z: tz, trunkR: 0.01, canopyR: 3, canopyY0: ground + 1, canopyY1: ground + 60 };
    const ball = launchBall({ club: CLUBS.iron, power: 1, accuracy: 0, spin: 0, aimYaw: yaw }, envOf(terrain));
    const v0 = Math.hypot(...ball.vel);
    const env = envOf(terrain, { obstacles: [canopy] });
    let b = ball;
    let entrySpeed = 0;
    let slowest = Infinity;
    let fastestPast = 0;
    const path: Vec3[] = [];
    for (let t = 0; t < 40 && (b.status === "flight" || b.status === "roll"); t += 1 / 120) {
      const was = Math.hypot(b.pos[0] - tx, b.pos[2] - tz) < 3;
      b = stepBall(b, env, 1 / 120).ball;
      path.push(b.pos);
      const sp = Math.hypot(...b.vel);
      const now = Math.hypot(b.pos[0] - tx, b.pos[2] - tz) < 3;
      if (!was && now && !entrySpeed) entrySpeed = sp;
      if (now && b.status === "flight") slowest = Math.min(slowest, sp);
      if (along(b.pos, tx, tz, dx, dz) > 3) fastestPast = Math.max(fastestPast, sp);
    }
    expect(entrySpeed).toBeGreaterThan(v0 * 0.5);
    // most of the speed is gone in the leaves, and nothing leaves the far side of the canopy at speed
    expect(slowest).toBeLessThan(entrySpeed * 0.2);
    expect(fastestPast).toBeLessThan(entrySpeed * 0.2);
    // it comes down at most a few metres past the far edge of the canopy
    for (const p of path) expect(along(p, tx, tz, dx, dz)).toBeLessThan(3 + 6);
    // the aim preview sees the same tree: its landing ring is under the canopy, not 150 m down the fairway
    const land = predictLanding(env, { club: CLUBS.iron, power: 1, accuracy: 0, spin: 0, aimYaw: yaw }, ball.pos);
    expect(along(land, tee[0], tee[2], dx, dz)).toBeLessThan(d + 6);
  });

  it("the real hole 1 trees: a shot at the nearest visible tree trunk does not come out past it", () => {
    const spots = courseTreeSpots(course, hole, terrain);
    const colliders = treeColliders(terrain, spots, course.dressing.theme, "idol");
    // from 25 m in front of a corridor tree, hitting a low punch (hybrid at a quarter power) straight at its trunk
    const k = colliders.findIndex((c) => terrain.zone(c.x, c.z) === "rough");
    const c = colliders[k]!;
    const tx = c.trunkX ?? c.x, tz = c.trunkZ ?? c.z;
    const ay = Math.atan2(tx - terrain.cup[0], tz - terrain.cup[2]);
    const sx = tx - Math.sin(ay) * 25, sz = tz - Math.cos(ay) * 25;
    const from: Vec3 = [sx, terrain.height(sx, sz) + 0.05, sz];
    const hidden = treesBlockingShot(spots, [sx, sz], ay);
    const visible = visibleTreeColliders(colliders, spots, [sx, sz], ay, hidden);
    // the tree the shot is aimed straight at is in the sight corridor, so the clearance hides it and it has no collider ...
    expect(hidden.has(k)).toBe(true);
    expect(visible).not.toContain(c);
    // ... and once drawn (no clearance), the same shot stops at it
    const env = envOf(terrain, { obstacles: colliders, lie: "rough" });
    const ball = { ...launchBall({ club: CLUBS.hybrid, power: 0.25, accuracy: 0, spin: 0, aimYaw: ay }, env), pos: from };
    const r = play(ball, env);
    for (const p of r.path) expect(along(p, tx, tz, Math.sin(ay), Math.cos(ay))).toBeLessThan(0);
  });
});

describe("tree colliders are the drawn trees, minus the hidden ones", () => {
  for (const id of Object.keys(COURSES) as CourseId[]) {
    it(`${id}: no collider for a clearance-hidden tree; every remaining canopy stays out of the sight corridor`, () => {
      const c = COURSES[id];
      for (const h of c.holes) {
        const t = buildHoleTerrain(c, h);
        const spots = courseTreeSpots(c, h, t);
        const colliders = treeColliders(t, spots, c.dressing.theme, "idol");
        expect(colliders.length).toBe(spots.length);
        const lies: [number, number][] = [[t.tee[0], t.tee[2]], ...h.layout.path.map((p) => [p[0], p[1]] as [number, number])];
        for (const ball of lies) {
          const yaw = Math.atan2(t.cup[0] - ball[0], t.cup[2] - ball[1]);
          const hidden = treesBlockingShot(spots, ball, yaw);
          const visible = visibleTreeColliders(colliders, spots, ball, yaw);
          expect(visible.length).toBe(spots.length - hidden.size);
          for (const k of hidden) expect(visible).not.toContain(colliders[k]);
          visible.forEach((col) => {
            const k = colliders.indexOf(col);
            expect(canopyClearance(spots[k]!, ball, yaw), `${id} h${h.number}`).toBeGreaterThanOrEqual(0);
          });
        }
      }
    });
  }

  it("the sim's tree list is the drawn list: main.ts draws courseTreeSpots with the scene rng (trees are its first draws)", () => {
    const src = readFileSync("apps/showcase-aura-links-3d/src/main.ts", "utf8");
    expect(src).toMatch(/const rng = makeRng\(hole\.number \* 7919 \+ course\.id\.length \* 131\);/);
    expect(src).toMatch(/const treeSpots = courseTreeSpots\(course, hole, terrain, rng\);/);
    expect(src).toMatch(/treeCollidersMounted = treeColliders\(terrain, treeSpots, theme, idolArt \? "idol" : "original"\);/);
    // the live shot, its flight steps, the autopilot and the landing preview all carry the obstacles
    expect(src.match(/\.\.\.shotHits/g)?.length).toBe(2);
    expect(src).toMatch(/\.\.\.shotObstacles\(\)/);
    expect(src).toMatch(/predictLanding\(/);
    expect(holeSceneSeed(course, hole)).toBe(hole.number * 7919 + course.id.length * 131);
    const a = courseTreeSpots(course, hole, terrain);
    const b = courseTreeSpots(course, hole, terrain, makeRng(holeSceneSeed(course, hole)));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  for (const id of ["stAuroras", "mapleHollow", "cloudTerrace", "neonBay"] as const) {
    it(`${id}: collider dims match the drawn Idol broadleaves and procedural pines`, () => {
      const c = COURSES[id as CourseId];
      if (!c) return;
      const theme = c.dressing.theme;
      for (const h of c.holes.slice(0, 3)) {
        const t = buildHoleTerrain(c, h);
        const spots = courseTreeSpots(c, h, t);
        if (!spots.length) continue;
        const colliders = treeColliders(t, spots, theme, "idol");
        const nodes = buildIdolTreeBatches(t, spots, theme, true, false).map(json);
        let checked = 0;
        // Idol broadleaves: instance position / scale -> trunk and canopy from the measured GLB profile
        let bl = 0;
        spots.forEach((sp, i) => {
          if (!treeIsBroadleaf(theme, i)) return;
          const key = idolBroadleafKey(theme, bl++);
          const batch = nodes.find((n) => n.name === `idol-trees-${key}`);
          const inst = batch.instances.find((x: any) => Math.hypot(x.position[0] - sp.x, x.position[2] - sp.z) < 1e-6);
          expect(inst, `${id} tree ${i}`).toBeTruthy();
          const g = IDOL_TREE_COLLIDER[key]!;
          const col = colliders[i]!;
          const wide = (inst.scale[0] + inst.scale[2]) / 2;
          expect(col.canopyR).toBeCloseTo(g.canopyR * wide, 6);
          expect(col.trunkR).toBeCloseTo(g.trunkR * wide, 6);
          expect(col.canopyY0).toBeCloseTo(inst.position[1] + g.canopyY0 * inst.scale[1], 6);
          expect(col.canopyY1).toBeCloseTo(inst.position[1] + g.canopyY1 * inst.scale[1], 6);
          // world size sanity: a 7-12 m tree, its canopy 2-4.5 m in radius, its trunk 0.15-0.75 m, the trunk under the canopy
          expect(col.canopyY1 - inst.position[1]).toBeGreaterThan(sp.h * 0.85);
          expect(col.canopyR).toBeGreaterThan(1.8);
          expect(col.canopyR).toBeLessThan(4.6);
          expect(col.trunkR).toBeGreaterThan(0.15);
          expect(col.trunkR).toBeLessThan(0.75);
          expect(Math.hypot((col.trunkX ?? col.x) - col.x, (col.trunkZ ?? col.z) - col.z)).toBeLessThan(col.canopyR * 0.3);
          checked += 1;
        });
        // procedural pines (conifer trunks batch): base as drawn (coniferBaseY), scale h / 6.3
        const trunks = nodes.find((n) => n.name === "conifer-trunks");
        spots.forEach((sp, i) => {
          if (treeIsBroadleaf(theme, i)) return;
          const inst = trunks.instances.find((x: any) => Math.hypot(x.position[0] - sp.x, x.position[2] - sp.z) < 1e-6);
          expect(inst, `${id} pine ${i}`).toBeTruthy();
          const s = inst.scale[1];
          expect(s).toBeCloseTo(sp.h / PROC_TREE_SCALE_DIV, 6);
          const col = colliders[i]!;
          const tall = theme === "dunes" ? 0.94 : 1;
          expect(col.trunkR).toBeCloseTo(PROC_TREE_COLLIDER.trunkR * s, 6);
          expect(col.canopyY0).toBeCloseTo(inst.position[1] + PROC_TREE_COLLIDER.pine.canopyY0 * s * tall, 6);
          expect(col.canopyY1).toBeCloseTo(inst.position[1] + PROC_TREE_COLLIDER.pine.canopyY1 * s * tall, 6);
          checked += 1;
        });
        expect(checked).toBe(spots.length);
      }
    });
  }

  it("?look=original: oak and pine colliders follow the procedural batches", () => {
    const t = terrain;
    const spots = courseTreeSpots(course, hole, t);
    const colliders = treeColliders(t, spots, course.dressing.theme, "original");
    const nodes = buildCourseTreeBatches(t, spots, course.dressing.theme, true, false).map(json);
    const trunks = nodes.find((n) => n.name === "conifer-trunks");
    expect(trunks.instances.length).toBe(spots.length);
    spots.forEach((sp, i) => {
      const inst = trunks.instances[i];
      const s = sp.h / PROC_TREE_SCALE_DIV;
      expect(inst.scale[1]).toBeCloseTo(s, 6);
      expect(colliders[i]!.trunkR).toBeCloseTo(PROC_TREE_COLLIDER.trunkR * s, 6);
      expect(colliders[i]!.canopyY1).toBeGreaterThan(inst.position[1] + s * 5);
    });
  });
});

describe("the flagstick", () => {
  const cup = terrain.cup;
  const pin = { x: cup[0], z: cup[2], y0: cup[1], height: 3.1, radius: 0.013 };
  const flying = (h: number, speed: number): BallState => ({
    pos: [cup[0] - 0.2, cup[1] + h, cup[2]], vel: [speed, 0, 0], curve: 0, backspin: 0, status: "flight", carry: 50, bounces: 0
  });

  it("a ball flying into the pole below its top bounces back off it at 0.3 of its speed", () => {
    const r = stepBall(flying(1.2, 20), envOf(terrain, { pin }), 1 / 60);
    expect(r.events.some((e) => e.kind === "tree")).toBe(true);
    expect(r.ball.vel[0]).toBeLessThan(0);
    expect(Math.abs(r.ball.vel[0])).toBeCloseTo(20 * 0.3, 1);
    expect(r.ball.pos[0]).toBeLessThan(cup[0]);
  });

  it("over the top of the pole, or with no pin in the env, the ball flies on", () => {
    const over = stepBall(flying(3.6, 20), envOf(terrain, { pin }), 1 / 60).ball;
    expect(over.vel[0]).toBeGreaterThan(19);
    const none = stepBall(flying(1.2, 20), envOf(terrain), 1 / 60).ball;
    expect(none.vel[0]).toBeGreaterThan(19);
    expect(none.pos[0]).toBeGreaterThan(cup[0]);
  });
});
