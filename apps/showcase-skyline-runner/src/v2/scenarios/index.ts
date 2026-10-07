// apps/showcase-skyline-runner/src/v2/scenarios/index.ts — real-path scenarios:
// mid-run respawns at the first mid checkpoint through the kit's own reset,
// summit spawns at the final checkpoint; autorun drives the scripted playthrough.
import { resolveSkylineActIndex } from "../../gameplay/act-palette";
import { checkpoints } from "../scene/binding";

export type SkylineScenario = "mid-run" | "summit" | "autorun" | "checkpoint-chain";

export interface SkylineScenarioHooks {
  respawnAt(checkpointId: string): void;
  startAutorun(): void;
}

export function parseSkylineScenario(raw: string | null): SkylineScenario | null {
  switch (raw) {
    case "mid-run":
    case "mid":
    case "checkpoint":
      return "mid-run";
    case "summit":
    case "finish":
    case "final":
      return "summit";
    case "autorun":
    case "replay":
    case "capture":
      return "autorun";
    case "checkpoint-chain":
    case "chain":
      return "checkpoint-chain";
    default:
      return null;
  }
}

export function applySkylineScenario(scenario: SkylineScenario, hooks: SkylineScenarioHooks) {
  const firstActTwo = checkpoints.find((cp) => resolveSkylineActIndex(cp.x) >= 2);
  switch (scenario) {
    case "mid-run":
      hooks.respawnAt(firstActTwo?.id ?? checkpoints[0]?.id ?? "start");
      break;
    case "summit":
      hooks.respawnAt(checkpoints[checkpoints.length - 1]?.id ?? "finish");
      break;
    case "checkpoint-chain":
      hooks.respawnAt(checkpoints[Math.min(1, checkpoints.length - 1)]?.id ?? "start");
      break;
    case "autorun":
      hooks.startAutorun();
      break;
  }
}

export function skylineScenarioLook(scenario: SkylineScenario | null): Record<string, unknown> {
  return {
    applied: scenario ?? "default-play",
    scene: "winter-dusk-union",
    route: "showcase-skyline-runner-v2"
  };
}
