import type { GameScenario } from "@aura3d/engine";
import { skylineDrive } from "../scenario-drive";

export const skylineScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  {
    description: "Opening-jump frame: pump ~90 fixed steps so the runner is mid-air past the first ledge.",
    setup(): void {
      skylineDrive().pumpFrames(90);
    }
  }
];
