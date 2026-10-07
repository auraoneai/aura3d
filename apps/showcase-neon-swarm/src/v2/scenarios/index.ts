// apps/showcase-neon-swarm/src/v2/scenarios/index.ts — deterministic
// fixtures (T2.1). Scenarios set state only through real sim paths — spawn
// the seeded schedule / place the player / grant the radial burst — no
// ?capture= reads, no DOM/HTML, no renderer pokes.
export const SWARM_SCENARIOS = ["wave-two", "finale", "burst-ready"] as const;
export type SwarmScenario = (typeof SWARM_SCENARIOS)[number];

export interface SwarmScenarioContext {
  /** Jump the campaign to the given wave and begin it via the real startWave path. */
  readonly beginWave: (wave: number) => void;
  /** Charge the radial burst to 100 through real kill/graze bookkeeping. */
  readonly chargeBurst: () => void;
  readonly sync: () => void;
}

export function applySwarmScenario(name: string, ctx: SwarmScenarioContext): SwarmScenario | undefined {
  if (!SWARM_SCENARIOS.includes(name as SwarmScenario)) return undefined;
  if (name === "wave-two") {
    ctx.beginWave(2);
  } else if (name === "finale") {
    ctx.beginWave(5);
  } else {
    ctx.beginWave(1);
    ctx.chargeBurst();
  }
  ctx.sync();
  return name as SwarmScenario;
}
