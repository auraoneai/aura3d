import { describe, expect, it } from "vitest";
import { createAiController } from "../../../examples/aura-slam/sim/aiController";
import { injectedEngine, pristineEngine, shippedEngine, useShipped } from "./oracle";
import { humanPolicy, mulberry32 } from "./scenario";

describe("AiController facade (ported TS) agrees with the original's own decisions on identical states", () => {
  it("planShot, steer and planServe", () => {
    const Pristine = pristineEngine();
    const Injected = useShipped ? shippedEngine() : injectedEngine();
    let shots = 0, steers = 0, serves = 0;
    for (const difficulty of ["beginner", "club", "ace", "pro", "legend"] as const) {
      const A = Pristine.create({ difficulty, venue: "hard" });
      const B = Injected.create({ difficulty, venue: "hard" });
      const rng = mulberry32(31 + difficulty.length);
      for (let i = 0; i < 2400; i++) {
        humanPolicy(A, rng, i); A.step(1 / 60);
        if (i % 50 !== 0) continue;
        B.restore(A.snapshot());
        const facade = createAiController(B.__aiEnv);
        const sa = JSON.stringify(A.__fn.aiShotPlan(0.8));
        expect(JSON.stringify(facade.planShot({ quality: 0.8 } as never))).toBe(sa); shots++;
        const ball = A.state.ball;
        const want = ball.active && ball.lastHit === "player" ? A.__fn.contactTarget(ball, "ai") : A.__fn.aiRecoveryTarget();
        const got = facade.steer({} as never, 1 / 60);
        expect(got).toEqual({ targetX: want.x, targetY: want.y }); steers++;
        if (A.state.serveAttempt && A.state.server === "ai") {
          A.__fn.planCPUServe();
          const plan = facade.planServe({} as never);
          expect(plan).toEqual({ aim: { x: A.state.serveAttempt.aim.x, y: A.state.serveAttempt.aim.y }, power: !!A.state.serveAttempt.power }); serves++;
        }
      }
    }
    expect(shots).toBeGreaterThan(100);
    expect(steers).toBeGreaterThan(100);
    expect(serves).toBeGreaterThan(0);
  }, 120_000);
});
