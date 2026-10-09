import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const openClear: GameScenario = {
  description: "heat 1 cleared with open shots",
  setup() {
    drive.resetToHeat(1);
    drive.hideModal();
    drive.applyOutcome("swish", 4);
    drive.applyOutcome("swish", 4);
    drive.sync();
  }
};
