/**
 * The second shot must be staged where the DRAWN ball rests: a full first shot runs through the live sim at the game's fixed
 * step with the fixed-step presenter and the game's draw rule (game/ballView.ts), then the next address begins (main.ts
 * beginAddress drops the finished ball record); the drawn ball must equal the staged lie (round.ballPos) within 5 cm.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFixedStepPresenter, createRecordBlend } from "@aura3d/engine/game";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { launchBall, makeRng, rollWind, stepBall } from "../../../apps/showcase-aura-links-3d/src/game/sim";
import { clubForShot, planShot } from "../../../apps/showcase-aura-links-3d/src/game/autopilot";
import { presentedBallPos } from "../../../apps/showcase-aura-links-3d/src/game/ballView";
import type { BallState, CourseId, Vec3 } from "../../../apps/showcase-aura-links-3d/src/game/types";

const FIXED_BALL_DT = 1 / 120;

describe("drawn ball == staged ball when the next address begins", () => {
  for (const id of Object.keys(COURSES) as CourseId[]) {
    it(`${id}: holes 1-3, first shot through the presenter path`, () => {
      const course = COURSES[id];
      for (const hole of course.holes.slice(0, 3)) {
        const t = buildHoleTerrain(course, hole);
        const wind = rollWind(course, makeRng(hole.number));
        const staged0: Vec3 = [t.tee[0], t.tee[1] + 0.035, t.tee[2]];
        const sit = { terrain: t, gravity: course.gravity, airDensity: course.airDensity, wind, ballPos: staged0, lie: "tee" as const };
        const plan = planShot(sit);
        const club = clubForShot(plan.club, t.cupDistance(staged0[0], staged0[2]));
        const env = { terrain: t, gravity: course.gravity, airDensity: course.airDensity, wind, lie: "fairway" as const, liePenalty: 1 };
        let ball: BallState | null = { ...launchBall({ club, power: plan.power, accuracy: 0.05, spin: 0.1, aimYaw: plan.aimYaw }, env), pos: staged0 };
        let staged: Vec3 = staged0;
        let phase = "flight";
        const presenter = createFixedStepPresenter<{ pos: Vec3 }>({
          snapshot: () => ({ pos: (ball ? [...ball.pos] : [...staged]) as Vec3 }),
          blend: createRecordBlend<{ pos: Vec3 }>({ snapDistance: 8, position: (s) => s.pos })
        });
        let acc = 0;
        let drawn: Vec3 = staged;
        for (let frame = 0; frame < 60 * 40 && phase === "flight"; frame++) {
          acc = Math.min(acc + 1 / 60, FIXED_BALL_DT * 8);
          while (acc >= FIXED_BALL_DT && phase === "flight" && ball) {
            acc -= FIXED_BALL_DT;
            const r = stepBall(ball, env, FIXED_BALL_DT);
            ball = r.ball;
            presenter.afterStep();
            for (const ev of r.events) if (ev.kind === "rest" || ev.kind === "holed") { staged = [...ev.pos] as Vec3; phase = "between"; }
            if (ball.status === "water" || ball.status === "oob") { staged = staged0; phase = "between"; }
          }
          drawn = presentedBallPos({ phase, interpolate: true, ball: ball?.pos ?? null, staged, present: () => presenter.present({ alpha: acc / FIXED_BALL_DT }, true).pos });
        }
        expect(phase, `${id} h${hole.number}`).toBe("between");
        // between: the resting ball is drawn where it stopped
        expect(Math.hypot(drawn[0] - staged[0], drawn[2] - staged[2]), `${id} h${hole.number} between`).toBeLessThan(0.05);
        // beginAddress: the finished record is dropped; the drawn ball is the staged lie the golfer and club are placed from
        ball = null;
        presenter.reset();
        phase = "address";
        drawn = presentedBallPos({ phase, interpolate: true, ball: null, staged, present: () => presenter.present({ alpha: 0 }, true).pos });
        expect(Math.hypot(drawn[0] - staged[0], drawn[2] - staged[2]), `${id} h${hole.number} address`).toBeLessThan(0.05);
      }
    });
  }

  it("main.ts draws the ball with presentedBallPos and beginAddress drops the finished ball record", () => {
    const src = readFileSync("apps/showcase-aura-links-3d/src/main.ts", "utf8");
    expect(src).toMatch(/const bp = presentedBallPos\(\{/);
    const begin = src.slice(src.indexOf("function beginAddress(): void {"));
    expect(begin.slice(0, 600)).toMatch(/state\.ball = null;\s*ballPresenter\.reset\(\);/);
  });
});
