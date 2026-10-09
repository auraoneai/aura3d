import type { GameScenario } from "@aura3d/engine";
import { gravityDrive } from "../scenario-drive";

const coasting: GameScenario = {
  description: "Delivery in flight: launch toward Gale with the authored route vector and sim-step ~1.2s so the pod is mid-corridor.",
  setup(): void {
    const d = gravityDrive();
    d.launch([0.94, -0.34], 3.6);
    for (let i = 0; i < 72; i += 1) d.stepSim(1 / 60);
  }
};

export const gravityScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  coasting
];
