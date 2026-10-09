import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";
import { RACK_COUNT } from "../racks";

export const eightFinish: GameScenario = {
  description: "every rack cleared: solids then the eight",
  setup() {
    drive.resetForFixture();
    for (let rack = 1; rack <= RACK_COUNT; rack += 1) {
      drive.resolve({ firstContact: 1, cushionAfterContact: true, potted: [1, 2, 3, 4, 5, 6, 7] });
      drive.resolve({ firstContact: 8, cushionAfterContact: true, potted: [8] });
      if (rack < RACK_COUNT) drive.advanceRack();
    }
    drive.sync();
  }
};
