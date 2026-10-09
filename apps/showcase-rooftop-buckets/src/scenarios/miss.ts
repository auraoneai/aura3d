import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const miss: GameScenario = {
  description: "heat 1 brick off the rim",
  setup() {
    drive.resetToHeat(1);
    drive.hideModal();
    drive.applyOutcome("brick", 1);
    drive.sync();
  }
};
