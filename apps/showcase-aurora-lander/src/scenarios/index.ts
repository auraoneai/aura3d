import type { GameScenario } from "@aura3d/engine";
import { auroraDrive } from "../scenario-drive";

export const auroraScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  {
    description: "Early descent: ~2.5s of fixed steps so the lander is airborne over the pad field.",
    setup(): void {
      const d = auroraDrive();
      for (let i = 0; i < 150; i += 1) d.stepSim(1 / 60);
    }
  }
];
