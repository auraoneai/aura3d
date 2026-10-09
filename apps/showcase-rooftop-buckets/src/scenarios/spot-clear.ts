import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const spotClear: GameScenario = {
  description: "heat 2 cleared spot by spot",
  setup() {
    drive.resetToHeat(2);
    drive.hideModal();
    drive.applyOutcome("swish", 0);
    drive.applyOutcome("swish", 1);
    drive.applyOutcome("swish", 2);
    drive.sync();
  }
};
