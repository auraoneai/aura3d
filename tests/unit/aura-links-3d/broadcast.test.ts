import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  BROADCAST_CLEARANCE_M,
  CUP_CAM_MAX_PUTT_M,
  FLYOVER_SECONDS,
  IMPACT_FOV_KICK_DEG,
  TRACER_CAM_MIN_CARRY_M,
  cupCamPose,
  flyoverAllowed,
  flyoverShots,
  tracerCamPose,
  wantsCupCam,
  wantsTracerCam
} from "../../../apps/showcase-aura-links-3d/src/game/broadcast";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const IDS = Object.keys(COURSES) as CourseId[];
const main = readFileSync(resolve(__dirname, "../../../apps/showcase-aura-links-3d/src/main.ts"), "utf8");

describe("Aura Links broadcast camera (GU47 LINKS-12, the signature effect)", () => {
  it("plans a three-shot flyover of 4-6 s for every hole, every rail point above the turf", () => {
    expect(FLYOVER_SECONDS).toBeGreaterThanOrEqual(4);
    expect(FLYOVER_SECONDS).toBeLessThanOrEqual(6);
    for (const id of IDS) {
      for (const hole of COURSES[id].holes) {
        const terrain = buildHoleTerrain(COURSES[id], hole);
        const shots = flyoverShots(terrain, hole);
        expect(shots.length, `${id} ${hole.number}`).toBe(3);
        const total = shots.reduce((s, shot) => s + shot.duration, 0);
        expect(total, `${id} ${hole.number}`).toBeCloseTo(FLYOVER_SECONDS, 6);
        for (const shot of shots) {
          expect(shot.points.length, shot.name).toBeGreaterThanOrEqual(2);
          expect(shot.duration, shot.name).toBeGreaterThan(0.5);
          for (const p of shot.points) {
            expect(p[1] - terrain.height(p[0], p[2]), `${id} ${hole.number} ${shot.name}`).toBeGreaterThanOrEqual(BROADCAST_CLEARANCE_M - 1e-9);
          }
        }
        // the last rail point is the hole's opening camera, so the sequence hands over without a jump
        const last = shots[2]!.points[shots[2]!.points.length - 1]!;
        expect(last[0]).toBeCloseTo(terrain.tee[0] - 2.0, 6);
        expect(last[2]).toBeCloseTo(terrain.tee[2] - 8.6, 6);
      }
    }
  });

  it("never plays the flyover under reduced motion (a cut instead), in QA/still captures or with ?flyover=0", () => {
    const base = { reducedMotion: false, qa: false, still: false, disabled: false };
    expect(flyoverAllowed(base)).toBe(true);
    expect(flyoverAllowed({ ...base, reducedMotion: true })).toBe(false);
    expect(flyoverAllowed({ ...base, qa: true })).toBe(false);
    expect(flyoverAllowed({ ...base, still: true })).toBe(false);
    expect(flyoverAllowed({ ...base, disabled: true })).toBe(false);
    // main.ts checks flyoverAllowed before it calls play(), and skips the sequence on any key, tap or swing
    const start = main.slice(main.indexOf("function startFlyover"), main.indexOf("function skipFlyover"));
    expect(start.indexOf("flyoverAllowed(")).toBeGreaterThan(-1);
    expect(start.indexOf("flyoverAllowed(")).toBeLessThan(start.indexOf(".play("));
    expect(start).toMatch(/bars: true/);
    expect(main).toMatch(/if \(flyover && justPressed\.size > 0\) skipFlyover\(\)/);
    expect(main).toMatch(/addEventListener\("pointerdown", \(\) => skipFlyover\(\)\)/);
  });

  it("depth of field only in the flyover and the cup cam: off at boot, after each hole swap, on hole-out and at the next address", () => {
    expect(main.match(/setBroadcastDof\(true/g)?.length).toBe(2);
    expect(main).toMatch(/setBroadcastDof\(true, 70\)/);
    expect(main).toMatch(/broadcastCam\?\.kind === "cup"\) setBroadcastDof\(true/);
    expect((main.match(/setBroadcastDof\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("tracer cam on drives of 150 m or more, cup cam on putts of 8 m or less", () => {
    expect(wantsTracerCam({ putter: false, carry: TRACER_CAM_MIN_CARRY_M })).toBe(true);
    expect(wantsTracerCam({ putter: false, carry: 140 })).toBe(false);
    expect(wantsTracerCam({ putter: true, carry: 200 })).toBe(false);
    expect(wantsCupCam({ putter: true, distanceToCup: CUP_CAM_MAX_PUTT_M })).toBe(true);
    expect(wantsCupCam({ putter: true, distanceToCup: 12 })).toBe(false);
    expect(wantsCupCam({ putter: false, distanceToCup: 3 })).toBe(false);
  });

  it("tracer and cup cams stay above the turf and look at the ball; the impact FOV kick is 2 deg", () => {
    for (const id of IDS) {
      const hole = COURSES[id].holes[0]!;
      const terrain = buildHoleTerrain(COURSES[id], hole);
      const launch = terrain.tee;
      const ball: [number, number, number] = [launch[0] + 3, launch[1] + 25, launch[2] + 120];
      const tracer = tracerCamPose(terrain, launch, terrain.lineYaw, ball);
      expect(tracer.position[1] - terrain.height(tracer.position[0], tracer.position[2]), id).toBeGreaterThanOrEqual(1.6 - 1e-9);
      expect(tracer.target).toEqual(ball);
      expect(tracer.fov).toBeLessThan(38);
      const near: [number, number, number] = [terrain.cup[0] - 4, terrain.cup[1], terrain.cup[2] - 2];
      const cup = cupCamPose(terrain, near);
      expect(cup.position[1], id).toBeGreaterThan(terrain.height(cup.position[0], cup.position[2]));
      expect(Math.hypot(cup.position[0] - terrain.cup[0], cup.position[2] - terrain.cup[2])).toBeCloseTo(1.7, 6);
    }
    expect(IMPACT_FOV_KICK_DEG).toBe(2);
  });
});
