import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  BROADCAST_CLEARANCE_M,
  CUP_CAM_MAX_PUTT_M,
  FLYOVER_SECONDS,
  IMPACT_FOV_KICK_DEG,
  TRACER_BALL_TOP_MARGIN,
  TRACER_CAM_MIN_CARRY_M,
  TRACER_GROUND_SHARE,
  TRACER_MAX_FOV_DEG,
  cupCamPose,
  flyoverAllowed,
  flyoverShots,
  tracerCamPose,
  wantsCupCam,
  wantsTracerCam
} from "../../../apps/showcase-aura-links-3d/src/game/broadcast";
import { COURSE_LOOKS, hasBlackSky } from "../../../apps/showcase-aura-links-3d/src/game/lighting";
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

  it("black-sky tracer cam (Mare): the horizon stays in the lower frame, the lens widens to keep the ball (no sky-only black frames)", () => {
    // 2026-11-18 real-GPU sweep: the low-gravity ball pulled the tracer cam up into the airless black sky for seconds
    const rad = Math.PI / 180;
    const course = COURSES.mareCourse;
    expect(hasBlackSky(COURSE_LOOKS.mareCourse)).toBe(true);
    expect(main).toMatch(/tracerCamPose\(t, broadcastCam\.launch, broadcastCam\.yaw, ball\.pos, \{ keepHorizon: hasBlackSky\(COURSE_LOOKS\[state\.courseId\]\) \}\)/);
    for (const hole of course.holes) {
      const terrain = buildHoleTerrain(course, hole);
      const launch = terrain.tee;
      const fwd = [Math.sin(terrain.lineYaw), Math.cos(terrain.lineYaw)] as const;
      // a Mare flight: low gravity, so high over the near fairway (apex up to ~60 m over the first 30-120 m)
      for (const [along, up] of [[4, 6], [12, 18], [30, 40], [60, 60], [120, 55], [200, 20]] as const) {
        const ball: [number, number, number] = [launch[0] + fwd[0] * along, launch[1] + up, launch[2] + fwd[1] * along];
        const pose = tracerCamPose(terrain, launch, terrain.lineYaw, ball, { keepHorizon: true });
        const label = `hole ${hole.number} ball ${along} m out, ${up} m up`;
        const dx = pose.target[0] - pose.position[0], dz = pose.target[2] - pose.position[2];
        const pitch = Math.atan2(pose.target[1] - pose.position[1], Math.hypot(dx, dz));
        const half = (pose.fov * rad) / 2;
        // the horizon (pitch 0) sits at least TRACER_GROUND_SHARE of the frame height above the bottom edge
        const horizonY = -Math.tan(pitch) / Math.tan(half); // -1 bottom .. 1 top
        expect((horizonY + 1) / 2, label).toBeGreaterThanOrEqual(TRACER_GROUND_SHARE - 1e-6);
        expect(pose.fov, label).toBeLessThanOrEqual(TRACER_MAX_FOV_DEG);
        // the lens follows the ball: it stays in frame whenever the widest lens can hold it
        const bdx = ball[0] - pose.position[0], bdz = ball[2] - pose.position[2];
        const ballPitch = Math.atan2(ball[1] - pose.position[1], Math.hypot(bdx, bdz));
        const ballY = Math.tan(ballPitch - pitch) / Math.tan(half);
        if (pose.fov < TRACER_MAX_FOV_DEG) expect(ballY, label).toBeLessThanOrEqual(1 - 2 * TRACER_BALL_TOP_MARGIN + 1e-6);
        // the target stays on the ball's bearing
        expect(Math.abs(Math.atan2(dx, dz) - Math.atan2(bdx, bdz)), label).toBeLessThan(1e-6);
      }
    }
    // the day courses keep the plain tracer (target on the ball)
    const hole = COURSES.cloudTerrace.holes[0]!;
    const terrain = buildHoleTerrain(COURSES.cloudTerrace, hole);
    const ball: [number, number, number] = [terrain.tee[0], terrain.tee[1] + 40, terrain.tee[2] + 30];
    expect(tracerCamPose(terrain, terrain.tee, terrain.lineYaw, ball, { keepHorizon: hasBlackSky(COURSE_LOOKS.cloudTerrace) }).target).toEqual(ball);
  });
});
