import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const pressureClear: GameScenario = {
  description: "heat 3 cleared past the contest beat",
  setup() {
    drive.resetToHeat(3);
    drive.hideModal();
    drive.aimSpot(2);
    drive.stagePressureHoop(2);
    drive.applyOutcome("swish", 4);
    drive.applyOutcome("swish", 4);
    drive.sync();
  }
};
