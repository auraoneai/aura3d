import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const buzzer: GameScenario = {
  description: "heat 5 clock expiry — game over",
  setup() {
    drive.resetToHeat(5);
    drive.hideModal();
    drive.expireClock();
    drive.cue("buzzerFail", 0.9);
    drive.sync();
  }
};
