import type { GameScenario } from "@aura3d/engine";
import { mechDrive } from "../scenario-drive";

export const mechScenarios: GameScenario[] = [
  { description: "Default playable boot: hangar turntable (no staging).", setup() {} },
  {
    description: "Locked build in the arena, ~2s of exchanged strikes via the sim-tick drive.",
    setup(): void {
      const d = mechDrive();
      d.enterArena();
      d.pumpFrames(150);
    }
  }
];
