import type { AiController, AiReadContext, AiShotPlan } from "../contract/ai";
import { createAiModule, type AiEnv, type AiModule } from "./ai";

/**
 * Contract facade over the ported AI module. In the source the CPU's decisions are interleaved with the engine's
 * update loop (`updateAI`), so the engine drives the module directly; this facade exposes the same decision functions
 * through the `AiController` seam for tests and for any other consumer that wants a decision without stepping a match.
 * All three methods read the live match from `env.state` (the engine's single state object); `ctx` carries the same data
 * and is used only for the contact quality (`ctx.quality`, default 1) that `attemptContact` computes in the source.
 */
export function createAiController(env: AiEnv, module: AiModule = createAiModule(env)): AiController & { readonly module: AiModule } {
  return {
    module,
    steer(ctx: AiReadContext) {
      const ball = env.state.ball;
      const target = ball.active && ball.lastHit === "player" ? module.contactTarget(ball, "ai") : module.aiRecoveryTarget();
      return { targetX: target.x, targetY: target.y };
    },
    planShot(ctx: AiReadContext & { quality?: number }): AiShotPlan {
      return module.aiShotPlan(typeof ctx.quality === "number" ? ctx.quality : 1);
    },
    planServe() {
      module.planCPUServe();
      const attempt = env.state.serveAttempt;
      return { aim: { x: attempt.aim.x, y: attempt.aim.y }, power: !!attempt.power };
    },
  };
}
