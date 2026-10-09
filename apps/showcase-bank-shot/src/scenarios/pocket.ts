import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const pocket: GameScenario = {
  description: "ball 1 potted on a legal hit",
  setup() {
    drive.resetForFixture();
    drive.resolve({ firstContact: 1, cushionAfterContact: true, potted: [1] });
    drive.toast("BALL 1 DOWN");
    drive.sync();
  }
};
