import type { GameScenario } from "@aura3d/engine";
import { galleryDrive } from "../scenario-drive";

export const galleryScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  {
    description: "Mid-heist: thief teleported into the main hall near the guard patrol, ~2s stepped.",
    setup(): void {
      const d = galleryDrive();
      d.teleport(0, -1.5);
      d.pumpFrames(120);
    }
  }
];
