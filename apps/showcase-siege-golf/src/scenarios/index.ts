import type { GameScenario } from "@aura3d/engine";
import { siegeDrive } from "../scenario-drive";

export const siegeScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  {
    description: "Opening camera settled ~2s in, ball on the tee, course composed.",
    setup(): void {
      siegeDrive().pumpFrames(120);
    }
  }
];
