// apps/showcase-deep-recovery/src/v2/scenarios/index.ts — deterministic
// scenario poses (T2.6). Each scenario seeds the real mission state through
// the same reset path gameplay uses, then poses the sub into a composed
// frame: a grapple-ready approach, a mid-trench dive, an abyssal run.
// appliedLook is identical on every scenario URL (§7.2.1).

export interface DeepScenarioHooks {
  poseSub(x: number, y: number, z: number, yaw: number): void;
  setOxygen(v: number): void;
  setHull(v: number): void;
  firePing(): void;
  reset(): void;
}

export const DEEP_SCENARIOS = {
  // Crate-s1 sits at (2.8,-7.5,-7.5); pose on its approach bearing.
  "reef-grapple": {
    description: "Shallow reef grapple approach: sub posed 6m off crate-s1.",
    apply(h: DeepScenarioHooks) {
      h.reset();
      h.poseSub(1.4, -6.8, -3.9, Math.atan2(1.4, -3.6));
      h.firePing();
    }
  },
  // Mid-trench heavy crate h1 at (-6,-26,-16), oxygen partially spent.
  "trench-dive": {
    description: "Mid-trench dive: heavy salvage in the wreck basin, O2 at 70.",
    apply(h: DeepScenarioHooks) {
      h.reset();
      h.poseSub(-3.4, -22.0, -10.4, Math.atan2(-2.6, -5.6));
      h.setOxygen(70);
      h.firePing();
    }
  },
  // Abyssal black box h3 at (0,-46,-22), hull already scuffed.
  "abyss-run": {
    description: "Abyssal extraction: black-box salvage, hull at 72.",
    apply(h: DeepScenarioHooks) {
      h.reset();
      h.poseSub(2.0, -42.0, -15.5, Math.atan2(-2.0, -6.5));
      h.setOxygen(64);
      h.setHull(72);
      h.firePing();
    }
  }
} as const;

export type DeepScenarioId = keyof typeof DEEP_SCENARIOS;

export function applyDeepScenario(id: string | undefined, hooks: DeepScenarioHooks): string | null {
  if (!id || !(id in DEEP_SCENARIOS)) return null;
  DEEP_SCENARIOS[id as DeepScenarioId].apply(hooks);
  return id;
}
