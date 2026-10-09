import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const fire: GameScenario = {
  description: "heat 4 streak ignition",
  setup() {
    drive.resetToHeat(4);
    drive.hideModal();
    drive.applyOutcome("swish", 1);
    drive.applyOutcome("swish", 1);
    drive.applyOutcome("swish", 1);
    drive.cue("fireIgnite", 0.9);
    drive.sync();
  }
};
