// apps/showcase-mech-hangar/src/v2/scenarios/index.ts — real-path scenarios.
// "arena" runs the real lock-in path (the same requestLock the Enter key
// presses); "autorun" locks in and drives a scripted bout; "rematch" rebuilds
// the bout with the next aggression preset through the real startBout path.

export type MechScenario = "arena" | "autorun" | "rematch";

export interface MechScenarioHooks {
  lockIn(): void;
  startAutorun(): void;
  rematch(): void;
}

export function parseMechScenario(raw: string | null): MechScenario | null {
  switch (raw) {
    case "arena":
    case "pit":
    case "fight":
      return "arena";
    case "autorun":
    case "replay":
    case "capture":
      return "autorun";
    case "rematch":
    case "ko":
    case "round2":
      return "rematch";
    default:
      return null;
  }
}

export function applyMechScenario(scenario: MechScenario, hooks: MechScenarioHooks) {
  switch (scenario) {
    case "arena":
      hooks.lockIn();
      break;
    case "autorun":
      hooks.startAutorun();
      break;
    case "rematch":
      hooks.lockIn();
      hooks.rematch();
      break;
  }
}

export function mechScenarioLook(scenario: MechScenario | null): Record<string, unknown> {
  return {
    applied: scenario ?? "default-play",
    kind: "v2-scenario",
    honest: true
  };
}
