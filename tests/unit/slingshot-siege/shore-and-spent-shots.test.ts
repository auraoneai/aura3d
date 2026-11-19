// Shoreline and spent shots (real-GPU audit 2026-11-19):
//  - a shot that cleared the fort landed over the sea (x ~19), rested ~0.26 m above the water and rolled back: the
//    physics ground was one 120 x 88 m slab. The sim's ground now matches the island (GROUND_BOXES), and a shot,
//    block or gull that drops below the water past the shore sinks with a "sea-splash" event;
//  - after hitting the wall a bird rolled back ~7 m at a steady 0.7 m/s with the camera on it: a ball rolling on a
//    box never slows in the solver. Touching birds now get rolling resistance and a spent bird poofs away once it is
//    slow (or `SPENT_MAX_S` after its first impact); a downed bird stops flapping (`projectileDowned`);
//  - a block knocked onto the beach right of the fort rested ~0.2 m above the sand: the ground boxes had flat tops at
//    y 0 out to the waterline while the sand slopes from the turf lip down to the sea. Sloped slabs now follow it.
import { describe, expect, it } from "vitest";
import { CHAPTERS, LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { GROUND_BOXES, SEA_Y, SiegeSim, groundTopAt, onLand, type SimEvent } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { SEA_LEVEL, buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { DECOR_COLLIDERS } from "../../../apps/showcase-slingshot-siege/src/game/decorLayout";
import { drawFor, launchVelocity, solveDraw } from "../../../apps/showcase-slingshot-siege/src/game/autopilot";
import { stageSurface } from "./stage-surface";

type Node = { children?: Node[] };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));

describe("slingshot-siege shoreline", () => {
  it("the sim's sea level is the stage's", () => {
    expect(SEA_Y).toBe(SEA_LEVEL);
  });

  it("the sim's ground is the visual island: land under every ground box, open water along the lane past the shore", () => {
    const surface = stageSurface(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json) as never);
    const overWater: string[] = [];
    for (const [x0, x1, z0, z1] of GROUND_BOXES) {
      // 0.35 m inside each box edge the stage surface is land (above the sea), never open water.
      for (let x = x0 + 0.35; x <= x1 - 0.35 + 1e-9; x += 0.25) {
        for (let z = z0 + 0.35; z <= z1 - 0.35 + 1e-9; z += 0.25) {
          if (surface.height(x, z) < SEA_LEVEL + 0.02) overWater.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
        }
      }
    }
    expect(overWater).toEqual([]);
    // Along the shot lane, from 0.4 m past the visual shoreline out to the right wall, the sim has no ground.
    for (const z of [-0.4, 0, 0.4]) {
      let shore = 0;
      for (let x = 8; x < 16; x += 0.05) if (surface.height(x, z) > SEA_LEVEL + 0.01) shore = x;
      for (let x = shore + 0.4; x < 19.5; x += 0.25) expect(onLand(x, z), `lane x ${x.toFixed(2)} z ${z}`).toBe(false);
    }
  }, 120_000);

  it("every level's fort stands on the island ground", () => {
    for (const level of LEVELS) for (const p of level.pieces) expect(onLand(p.x, p.z), `L${level.id + 1} piece at ${p.x}, ${p.z}`).toBe(true);
  });

  it("the sim ground under the right-hand beach follows the sand (no block rests ~0.2 m above the beach edge)", () => {
    const surface = stageSurface(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json) as never);
    const bad: string[] = [];
    for (let x = 9.25; x <= 11.5; x += 0.1) {
      for (let z = -3.3; z <= 4.3; z += 0.1) {
        const top = groundTopAt(x, z);
        const h = surface.height(x, z);
        if (top === null || h > 0.05 || h < SEA_LEVEL + 0.005) continue; // scenery (rocks, cliffs) or open water
        if (Math.abs(top - h) > 0.08) bad.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) ground ${top.toFixed(2)} sand ${h.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("fort pieces laid out past the turf lip stand on the sand (Gull Keep, Moon Roost walls), not ~0.2 m above it", () => {
    const surface = stageSurface(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json) as never);
    const bad: string[] = [];
    let onBeach = 0;
    for (const level of LEVELS) {
      for (const p of level.pieces) {
        const top = groundTopAt(p.x, p.z);
        if (top === null || top > -0.03) continue; // on the flat turf
        const bottom = p.y - p.hy;
        if (bottom > 0.02) continue; // stacked on another piece
        onBeach += 1;
        // Highest sand under the footprint: a brick laid across the turf lip rests on the lip.
        const c = Math.abs(Math.cos(p.yaw ?? 0)), sn = Math.abs(Math.sin(p.yaw ?? 0));
        const ex = c * p.hx + sn * p.hz, ez = sn * p.hx + c * p.hz;
        let sand = -Infinity;
        for (const fx of [-0.9, 0, 0.9]) for (const fz of [-0.9, 0, 0.9]) sand = Math.max(sand, Math.min(0, surface.height(p.x + fx * ex, p.z + fz * ez)));
        const gap = bottom - sand;
        if (Math.abs(gap) > 0.08) bad.push(`L${level.id + 1} piece at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}: bottom ${bottom.toFixed(3)} sand ${sand.toFixed(3)}`);
      }
    }
    expect(onBeach).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  }, 120_000);

  it("blocks dropped on the beach slabs come to rest on the sand", () => {
    const base = LEVELS[0]!;
    const spots: [number, number][] = [[10.6, 0], [11.2, -1.2], [11.3, 1.6], [9.9, 3.4], [9.7, -2.5]];
    const level = { ...base, pieces: spots.map(([x, z]) => ({ x, y: 0.6, z, hx: 0.25, hy: 0.25, hz: 0.25, material: "wood" as const })), gulls: base.gulls };
    const sim = new SiegeSim({ level, seed: 3, decor: DECOR_COLLIDERS });
    for (let f = 0; f < 240; f += 1) sim.update(1 / 60);
    const surface = stageSurface(buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes.map(json) as never);
    sim.pieceList().forEach((p, i) => {
      expect(p.alive, `block ${i} still on the beach`).toBe(true);
      const at = p.body.position;
      // The block's lowest corner sits on the sand: centre height minus the sand under it is about one half extent
      // (a slab tilted a few degrees lifts one edge by a couple of centimetres).
      const gap = at[1] - 0.25 - surface.height(at[0], at[2]);
      expect(Math.abs(gap), `block ${i} at ${at.map((v) => v.toFixed(2)).join(", ")} gap ${gap.toFixed(3)}`).toBeLessThan(0.07);
    });
  }, 120_000);

  it("a shot that clears the fort sinks past the shore with a splash instead of resting on invisible floor", () => {
    const sim = new SiegeSim({ level: LEVELS[0]!, seed: 7, decor: DECOR_COLLIDERS });
    sim.drainEvents();
    // Over the fort, coming down around x 18-19 (where the audit's shot floated).
    sim.launch("stone", [9, 3, 0], [8, 3, 0]);
    const proj = sim.activeProjectile()!;
    let hover = 0;
    const events: SimEvent[] = [];
    for (let f = 0; f < 240; f += 1) {
      sim.update(1 / 60);
      events.push(...sim.drainEvents());
      if (!proj.dead) {
        const p = proj.body.position;
        if (p[0] > 11.6 && p[1] < 0.3) hover += 1;
      }
    }
    const splash = events.find((e) => e.kind === "sea-splash");
    expect(splash, "sea-splash event").toBeTruthy();
    expect(splash!.kind === "sea-splash" && splash!.what).toBe("projectile");
    expect(splash!.kind === "sea-splash" && splash!.at[0]).toBeGreaterThan(14);
    expect(proj.dead).toBe(true);
    // Falling at ~8 m/s it crosses the last 0.56 m above the water in a few frames; resting there was seconds.
    expect(hover).toBeLessThanOrEqual(6);
  }, 120_000);
});

describe("slingshot-siege spent shots", () => {
  it("a bird rolling on the ground at 0.7 m/s stops and is retired within a second, after well under a metre", () => {
    const sim = new SiegeSim({ level: LEVELS[0]!, seed: 7, decor: DECOR_COLLIDERS });
    const r = 0.3;
    sim.launch("stone", [0, r + 0.005, 0], [-0.7, 0, 0]);
    const proj = sim.activeProjectile()!;
    let lastX = 0, frames = 0;
    for (; frames < 180 && !proj.dead; frames += 1) {
      sim.update(1 / 60);
      if (!proj.dead) lastX = proj.body.position[0];
    }
    expect(proj.dead, "retired").toBe(true);
    expect(frames / 60).toBeLessThan(1.0);
    expect(Math.abs(lastX)).toBeLessThan(0.6);
  }, 120_000);

  it("a weak shot rolling (with spin) across the meadow at ~2.9 m/s stops within 2 m and is retired", () => {
    // Real-GPU pass: `speedSquared()` counts spin, so a rolling ball (spin = v / r) never read as slow and a weak
    // tri-bird rolled on across the grass with the camera on it. Spent-bird logic now reads the linear speed.
    const sim = new SiegeSim({ level: LEVELS[3]!, seed: 7, decor: DECOR_COLLIDERS });
    const r = 0.3;
    sim.launch("stone", [-4, r + 0.002, 0], [2.87, 0, 0]);
    const proj = sim.activeProjectile()!;
    proj.body.setAngularVelocity([0, 0, -2.87 / r]);
    let lastX = -4, frames = 0;
    for (; frames < 240 && !proj.dead; frames += 1) {
      sim.update(1 / 60);
      if (!proj.dead) lastX = proj.body.position[0];
    }
    expect(proj.dead, "retired").toBe(true);
    expect(frames / 60).toBeLessThan(1.8);
    expect(lastX - -4).toBeLessThan(2);
  }, 120_000);

  it("a bird that hits the fort wall comes to rest close to the wall and is retired; it is down (no flapping) after the hit", () => {
    const level = LEVELS[0]!;
    const sim = new SiegeSim({ level, seed: 7, decor: DECOR_COLLIDERS });
    // A flat battering shot into the foot of the tower.
    const pull = drawFor([6.9, 0.4], 9.81, 0.22);
    const sol = solveDraw(pull[0], pull[1]);
    sim.launch("pebble", sol.pouch, launchVelocity(sol));
    const proj = sim.activeProjectile()!;
    let impact: number[] | null = null, impactT = 0, maxTravel = 0, t = 0;
    let downedInFlight = false;
    for (let f = 0; f < 600 && !proj.dead; f += 1) {
      sim.update(1 / 60);
      t += 1 / 60;
      if (proj.dead) break;
      const p = proj.body.position;
      if (!impact && proj.impactAt >= 0) { impact = [...p]; impactT = t; }
      if (!impact && sim.projectileDowned(proj)) downedInFlight = true;
      if (impact) {
        expect(sim.projectileDowned(proj)).toBe(true);
        maxTravel = Math.max(maxTravel, Math.hypot(p[0] - impact[0]!, p[2] - impact[2]!));
      }
    }
    expect(impact, "the shot hit something").toBeTruthy();
    expect(downedInFlight).toBe(false);
    expect(proj.dead, "retired").toBe(true);
    expect(t - impactT).toBeLessThan(3.7);
    // The audit's bird rolled back ~7 m; a spent bird now stays within a few metres of where it hit.
    expect(maxTravel).toBeLessThan(3);
  }, 120_000);
});
