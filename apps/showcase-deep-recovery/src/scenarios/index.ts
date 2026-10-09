import type { GameScenario } from "@aura3d/engine";
import { deepDrive } from "../scenario-drive";

export const deepScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  {
    description: "Approach dive: ~3s of fixed steps so the sub is descending toward the wreck basin.",
    setup(): void {
      const d = deepDrive();
      for (let i = 0; i < 180; i += 1) d.stepSim(1 / 60);
    }
  }
];
