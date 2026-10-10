// Scenario wiring — extracted from boot.ts for 14-LOC.
import { applySwarmScenario } from "./scenarios";
import { INTERMISSION_FIRST_SECONDS, type SwarmRunCtx } from "./state";

export function applyNeonScenario(ctx: SwarmRunCtx, deps: {
  startWave(wave: number): void;
  syncHud(): void;
  beginIntermission(seconds: number): void;
}): void {
  const scenario = new URL(location.href).searchParams.get("scenario");
  if (scenario) {
    applySwarmScenario(scenario, {
      beginWave: (w) => deps.startWave(w),
      chargeBurst: () => { ctx.burstCharge = 100; },
      sync: () => { deps.syncHud(); }
    });
  } else {
    deps.beginIntermission(INTERMISSION_FIRST_SECONDS);
  }
}
