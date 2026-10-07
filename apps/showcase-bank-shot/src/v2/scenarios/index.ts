// apps/showcase-bank-shot/src/v2/scenarios/index.ts — deterministic fixtures (T2.1).
// Scenarios set state only: they resolve fixed ShotRecords through the same
// RulesEngine + outcome path as live play — no ?capture= reads, no DOM/HTML,
// no renderer pokes. `?scenario=<name>` selects one at boot; the same state is
// reachable from the play URL, so appliedLook stays identical (T2.6).
import type { ShotOutcome, ShotRecord } from "../../gameplay/rules";
import { RACK_COUNT } from "../../gameplay/racks";

export interface BankShotScenarioContext {
  readonly rules: {
    phase: string;
    beginShot(): boolean;
    resolveShot(r: ShotRecord): ShotOutcome;
    finishResolution(): void;
    advanceRack(): void;
    rerack(): void;
  };
  readonly sim: { resetRack(): void };
  readonly applyOutcome: (outcome: ShotOutcome) => void;
  readonly sync: () => void;
}

export const BANK_SHOT_SCENARIOS = ["pocket", "foul", "eight-finish", "rack-fail"] as const;
export type BankShotScenario = (typeof BANK_SHOT_SCENARIOS)[number];

export function applyBankShotScenario(
  name: string,
  ctx: BankShotScenarioContext
): BankShotScenario | undefined {
  if (!BANK_SHOT_SCENARIOS.includes(name as BankShotScenario)) return undefined;
  const resolveFixture = (record: ShotRecord) => {
    if (!ctx.rules.beginShot()) throw new Error(`bank-shot v2 scenario could not begin ${name}`);
    const outcome = ctx.rules.resolveShot(record);
    ctx.rules.finishResolution();
    ctx.applyOutcome(outcome);
    return outcome;
  };
  if (name === "pocket") {
    resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [1] });
  } else if (name === "foul") {
    resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [0] });
  } else if (name === "rack-fail") {
    resolveFixture({ firstContact: 8, cushionAfterContact: true, potted: [8] });
  } else {
    // eight-finish: clear all three racks, potting 1-7 then the 8 each time.
    for (let rack = 1; rack <= RACK_COUNT; rack += 1) {
      resolveFixture({ firstContact: 1, cushionAfterContact: true, potted: [1, 2, 3, 4, 5, 6, 7] });
      resolveFixture({ firstContact: 8, cushionAfterContact: true, potted: [8] });
      if (rack < RACK_COUNT) { ctx.rules.advanceRack(); ctx.sim.resetRack(); }
    }
  }
  ctx.sync();
  return name as BankShotScenario;
}
