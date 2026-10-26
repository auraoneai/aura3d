import { describe, expect, it } from "vitest";
import {
  AIM_FINE_RATE,
  aimRate,
  defaultAimYaw,
  pinArrowDegrees,
  stepAimOffset,
  wrapAngle,
  yawToward
} from "../../../apps/showcase-aura-links-3d/src/game/aim";
import { buildHoleTerrain, COURSES } from "../../../apps/showcase-aura-links-3d/src/game/courses";

describe("aim maths", () => {
  it("wraps at +-PI so the aim can turn through every angle", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 9);
    let offset = 0;
    for (let i = 0; i < 400; i += 1) offset = stepAimOffset(offset, 1, 1 / 60, 2, false);
    expect(Math.abs(offset)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it("turns a full circle by holding the key (no clamp)", () => {
    let offset = 0;
    let turned = 0;
    let held = 0;
    for (let i = 0; i < 60 * 12; i += 1) {
      held += 1 / 60;
      const next = stepAimOffset(offset, 1, 1 / 60, held, false);
      turned += wrapAngle(next - offset);
      offset = next;
    }
    expect(turned).toBeGreaterThan(Math.PI * 2);
  });

  it("speeds up while held and Shift is a slow fixed rate", () => {
    expect(aimRate(0, false)).toBeLessThan(aimRate(1, false));
    expect(aimRate(10, false)).toBeLessThanOrEqual(2.6);
    expect(aimRate(5, true)).toBe(AIM_FINE_RATE);
  });

  it("shot direction (sin, cos) of the yaw points at the target", () => {
    for (const [bx, bz, cx, cz] of [[0, 0, 0, 20], [5, -3, -12, 40], [0, 0, 30, 0], [0, 0, 0, -9], [4, 4, -20, -17]] as const) {
      const yaw = yawToward([bx, bz], [cx, cz]);
      const dx = cx - bx;
      const dz = cz - bz;
      const d = Math.hypot(dx, dz);
      expect(Math.sin(yaw)).toBeCloseTo(dx / d, 9);
      expect(Math.cos(yaw)).toBeCloseTo(dz / d, 9);
    }
  });

  it("the pin arrow is zero when aimed at the pin and turns left/right with the aim", () => {
    expect(pinArrowDegrees(1.2, 1.2)).toBeCloseTo(0, 9);
    // aim rotated left (larger yaw) of the pin: the pin is to the right (positive clockwise degrees)
    expect(pinArrowDegrees(1.0, 0.5)).toBeGreaterThan(0);
    expect(pinArrowDegrees(0.5, 1.0)).toBeLessThan(0);
    expect(Math.abs(pinArrowDegrees(0, Math.PI))).toBeCloseTo(180, 6);
  });

  it("every course: after a shot the default aim points at the pin from any ball position", () => {
    for (const course of Object.keys(COURSES) as Array<keyof typeof COURSES>) {
      const holes = COURSES[course].holes;
      expect(holes.length).toBeGreaterThan(0);
      for (const hole of holes) {
        const terrain = buildHoleTerrain(COURSES[course], hole);
        const spots: Array<[number, number]> = [
          [terrain.tee[0], terrain.tee[2]],
          [terrain.cup[0] - 30, terrain.cup[2] - 15],
          [terrain.cup[0] + 12, terrain.cup[2] + 40],
          [terrain.cup[0], terrain.cup[2] - 60]
        ];
        for (const ball of spots) {
          const yaw = defaultAimYaw({ ball, cup: [terrain.cup[0], terrain.cup[2]], lineYaw: terrain.lineYaw, onTee: false });
          const dx = terrain.cup[0] - ball[0];
          const dz = terrain.cup[2] - ball[1];
          const d = Math.hypot(dx, dz) || 1;
          expect(Math.sin(yaw)).toBeCloseTo(dx / d, 6);
          expect(Math.cos(yaw)).toBeCloseTo(dz / d, 6);
        }
      }
    }
  });

  it("a dogleg tee keeps the fairway line, a straight hole aims at the pin", () => {
    const straight = defaultAimYaw({ ball: [0, 0], cup: [0, 200], lineYaw: 0.05, onTee: true });
    expect(straight).toBeCloseTo(0, 9);
    const dogleg = defaultAimYaw({ ball: [0, 0], cup: [120, 120], lineYaw: 0.1, onTee: true });
    expect(dogleg).toBeCloseTo(0.1, 9);
  });
});

describe("the shot goes where it is aimed", () => {
  it("a ball launched at any aim yaw travels along that yaw (180 degrees travels backward)", async () => {
    const { CLUBS, launchBall, stepBall } = await import("../../../apps/showcase-aura-links-3d/src/game/sim");
    const course = COURSES.stAuroras;
    const terrain = buildHoleTerrain(course, course.holes[0]!);
    for (const yawDeg of [0, 45, 90, 135, 180, -90, -135]) {
      const aimYaw = (yawDeg * Math.PI) / 180;
      const env = { terrain, gravity: course.gravity, airDensity: course.airDensity, wind: { speed: 0, yaw: 0 }, lie: "tee" as const, liePenalty: 1 };
      let ball = launchBall({ club: CLUBS.iron, power: 0.9, accuracy: 0 as never, spin: 0 as never, aimYaw }, env);
      const start = [...ball.pos] as [number, number, number];
      for (let i = 0; i < 60 * 3; i += 1) ball = stepBall(ball, env, 1 / 60).ball;
      const dx = ball.pos[0] - start[0];
      const dz = ball.pos[2] - start[2];
      const travelled = Math.hypot(dx, dz);
      expect(travelled).toBeGreaterThan(20);
      expect(Math.sin(aimYaw) * dx + Math.cos(aimYaw) * dz).toBeGreaterThan(0.97 * travelled);
    }
  });
});
