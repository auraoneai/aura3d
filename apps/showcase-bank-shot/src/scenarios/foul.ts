import type { GameScenario } from "@aura3d/engine/contracts";
import { drive } from "../scenario-drive";

export const foul: GameScenario = {
  description: "scratch — cue ball potted, ball in hand",
  setup() {
    drive.resetForFixture();
    drive.resolve({ firstContact: 1, cushionAfterContact: true, potted: [0] });
    drive.toast("SCRATCH — BALL IN HAND");
    drive.sync();
  }
};
