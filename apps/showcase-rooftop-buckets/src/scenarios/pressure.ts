import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const pressure: GameScenario = {
  description: "live ball-to-hoop beat under the authored contest telegraph",
  setup() {
    drive.resetToHeat(3);
    drive.hideModal();
    drive.aimSpot(2);
    drive.stagePressureHoop(2);
    drive.stageFlight(0.72, 0.12, 8);
    drive.holdPaused();
    drive.sync();
  }
};
