import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const goldWin: GameScenario = {
  description: "gold ball swished on the final heat — victory",
  setup() {
    drive.resetToHeat(5);
    drive.hideModal();
    drive.applyOutcome("swish", 1, true);
    drive.cue("goldBall", 0.9);
    drive.sync();
  }
};
