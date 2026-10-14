// apps/showcase-pulse-tunnel/src/v2/scenarios/index.ts — ?scenario= hooks (T2.6).
// Each scenario steers the live run through the real clock/gate paths:
// `clock.advanceScheduler(seconds)` jumps the scheduler (the beat clock's own
// test hook) and `gateSystem.respace()` re-spaces live gates so the seek
// stays coherent — no DOM or renderer pokes.
export interface PulseScenarioHooks {
  readonly seekToBeat: (beat: number) => void;
  readonly startRun: () => void;
  readonly applyShieldDamage: (count: number) => void;
}

export const PULSE_SCENARIOS = ["drop", "mid-run", "low-shields"] as const;
export type PulseScenario = (typeof PULSE_SCENARIOS)[number];

export function applyPulseScenario(name: string | null, hooks: PulseScenarioHooks): PulseScenario | null {
  if (!name) return null;
  switch (name as PulseScenario) {
    case "drop":
      // Section 3 (drop) starts at beat 80 → t = 40 s.
      hooks.startRun();
      hooks.seekToBeat(80);
      return "drop";
    case "mid-run":
      // Mid-build, gates already streaming.
      hooks.startRun();
      hooks.seekToBeat(56);
      return "mid-run";
    case "low-shields":
      // One shield left, early chart — collision pressure is imminent.
      hooks.startRun();
      hooks.seekToBeat(20);
      hooks.applyShieldDamage(2);
      return "low-shields";
    default:
      return null;
  }
}
