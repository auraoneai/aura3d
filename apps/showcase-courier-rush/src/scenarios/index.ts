import type { GameScenario } from "@aura3d/engine";
import { courierDrive } from "../scenario-drive";

export const courierScenarios: GameScenario[] = [
  { description: "Default playable boot (depot, first dispatch, no staging).", setup() {} },
  {
    description: "Mid-shift avenue: van at the spawn pose after 120 sim frames (replaces ?capture=review).",
    setup(): void {
      courierDrive().placeVan(0, 0, -1.1);
      void courierDrive().pumpFrames(120);
    }
  }
];
