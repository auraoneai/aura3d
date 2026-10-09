import type { GameScenario } from "@aura3d/engine";
import { neonDrive } from "../scenario-drive";

const finale: GameScenario = {
  description: "Staged finale: jump to the last campaign wave, stage the charged-pulse decision frame with all threats live.",
  setup(): void {
    const d = neonDrive();
    d.jumpToWave(5);
    d.stepFixed(1);
    d.stageFinalePulse();
  }
};

export const neonScenarios: GameScenario[] = [
  { description: "Default playable boot (no staging).", setup() {} },
  finale
];
