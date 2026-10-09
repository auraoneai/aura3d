import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const rackFail: GameScenario = {
  description: "eight ball sunk early — rack lost",
  setup() {
    drive.resetForFixture();
    drive.resolve({ firstContact: 8, cushionAfterContact: true, potted: [8] });
    drive.sync();
  }
};
