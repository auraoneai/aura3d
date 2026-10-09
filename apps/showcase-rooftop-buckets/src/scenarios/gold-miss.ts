import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const goldMiss: GameScenario = {
  description: "gold ball missed on the final heat",
  setup() {
    drive.resetToHeat(5);
    drive.hideModal();
    drive.applyOutcome("brick", 1, true);
    drive.cue("buzzerFail", 0.9);
    drive.sync();
  }
};
