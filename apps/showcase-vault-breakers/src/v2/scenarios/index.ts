// apps/showcase-vault-breakers/src/v2/scenarios/index.ts — deterministic
// fixtures (T2.1). Scenarios set state only: they drive the real VaultFlow +
// sim at fixed plunger charges — no ?capture= reads, no DOM/HTML, no renderer
// pokes. `?scenario=<name>` selects one at boot; the same state is reachable
// from the play URL, so appliedLook stays identical (T2.6).
import type { VaultFlow } from "../../gameplay/ball-flow";

export const VAULT_SCENARIOS = ["in-play", "bumper-hit", "drained"] as const;
export type VaultScenario = (typeof VAULT_SCENARIOS)[number];

export interface VaultScenarioContext {
  readonly flow: VaultFlow;
  readonly sync: () => void;
}

/** Serve at a deterministic charge; 'bumper-hit' steps until a bumper event. */
export function applyVaultScenario(name: string, ctx: VaultScenarioContext): VaultScenario | undefined {
  if (!VAULT_SCENARIOS.includes(name as VaultScenario)) return undefined;
  if (name === "in-play") {
    if (!ctx.flow.serve(0.62)) throw new Error("vault v2 scenario could not serve");
    ctx.flow.update(30);
  } else if (name === "bumper-hit") {
    if (!ctx.flow.serve(0.78)) throw new Error("vault v2 scenario could not serve");
    let hit = false;
    for (let batch = 0; batch < 60 && !hit; batch += 1) {
      const events = ctx.flow.update(10);
      hit = events.some((e) => e.type === "bumper");
    }
    if (!hit) throw new Error("vault v2 scenario bumper-hit never registered");
  } else {
    // 'drained': a too-soft plunger that dies in the lane or drains quickly.
    if (!ctx.flow.serve(0.5)) throw new Error("vault v2 scenario could not serve");
    for (let batch = 0; batch < 120 && ctx.flow.snapshot().phase === "play"; batch += 1) {
      ctx.flow.update(10);
    }
  }
  ctx.sync();
  return name as VaultScenario;
}
