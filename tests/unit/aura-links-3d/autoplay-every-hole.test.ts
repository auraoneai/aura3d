import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { makeRng, rollWind } from "../../../apps/showcase-aura-links-3d/src/game/sim";
import { clubForShot, planShot, puttRange, simulateShot } from "../../../apps/showcase-aura-links-3d/src/game/autopilot";
import type { CourseId, LieKind, Vec3 } from "../../../apps/showcase-aura-links-3d/src/game/types";

/**
 * Plays every hole of every course with the demo autopilot against the live
 * sim, using the game's own rules: stroke-and-distance for water and out of
 * bounds, the lie from the terrain zone, wind rolled once per hole. Every hole
 * must be holed in 12 strokes or fewer (audit C1: 0 of 54 were holed before).
 */
function playHole(courseId: CourseId, index: number, seed: number, noise = 0) {
  const err = makeRng(seed ^ 0x9e37);
  const course = COURSES[courseId];
  const hole = course.holes[index]!;
  const terrain = buildHoleTerrain(course, hole);
  const wind = rollWind(course, makeRng(seed));
  let pos: Vec3 = [terrain.tee[0], terrain.tee[1] + 0.035, terrain.tee[2]];
  let strokes = 0;
  const log: string[] = [];
  while (strokes < 20) {
    let lie: LieKind = strokes === 0 ? "tee" : terrain.zone(pos[0], pos[2]);
    if (lie === "water" || lie === "oob") lie = "rough";
    const sit = { terrain, gravity: course.gravity, airDensity: course.airDensity, wind, ballPos: pos, lie };
    const plan = planShot(sit);
    const club = clubForShot(plan.club, terrain.cupDistance(pos[0], pos[2]));
    // `noise` models a human on the meter: power off by up to ±noise/2, an off-centre needle up to ±noise
    const power = Math.min(1, plan.power * (1 + (err() - 0.5) * noise));
    const off = (err() - 0.5) * 2 * noise;
    const ball = simulateShot(sit, club, power, plan.aimYaw, Math.abs(off), off);
    strokes += 1;
    log.push(`${plan.club}@${plan.power.toFixed(2)}→${ball.status}:${terrain.cupDistance(ball.pos[0], ball.pos[2]).toFixed(1)}`);
    if (ball.status === "holed") return { strokes, par: hole.par, log };
    if (ball.status === "water" || ball.status === "oob") { strokes += 1; continue; }
    pos = ball.pos;
  }
  return { strokes: Infinity, par: hole.par, log };
}

describe("aura links autopilot plays every hole", () => {
  for (const courseId of Object.keys(COURSES) as CourseId[]) {
    it(`${courseId}: all nine holes holed in 12 strokes or fewer`, () => {
      const results = COURSES[courseId].holes.map((_, i) => ({ hole: i + 1, ...playHole(courseId, i, 0x51ea + i) }));
      const bad = results.filter((r) => r.strokes > 12);
      expect(bad, JSON.stringify(bad)).toEqual([]);
      // the autopilot is a demo, not a bot that aces everything: most holes land within par+2
      const totalOver = results.reduce((a, r) => a + (r.strokes - r.par), 0);
      expect(totalOver).toBeLessThanOrEqual(18);
    }, 120_000);
  }

  for (const courseId of Object.keys(COURSES) as CourseId[]) {
    it(`${courseId}: an imprecise player (12% power error, off-centre strikes) still holes out in 12 or fewer`, () => {
      const results = COURSES[courseId].holes.map((_, i) => ({ hole: i + 1, ...playHole(courseId, i, 0x7a11 + i, 0.12) }));
      const bad = results.filter((r) => r.strokes > 12);
      expect(bad, JSON.stringify(bad)).toEqual([]);
    }, 120_000);
  }

  it("putter range keeps a putt near 60% of the meter", () => {
    expect(puttRange(1)).toBe(6);
    expect(puttRange(5)).toBe(9);
    expect(puttRange(10)).toBe(18);
    expect(puttRange(40)).toBe(30);
    for (const d of [4, 7, 11, 15]) {
      const share = d / puttRange(d);
      expect(share).toBeGreaterThan(0.4);
      expect(share).toBeLessThanOrEqual(0.67);
    }
  });
});
