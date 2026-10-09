/** Rotation-denied staging — the deleted ACCEPTANCE_PROBE.stageRotationTrap. */
import type { GameScenario } from "@aura3d/engine";
import { blockfallDrive } from "../scenario-drive";

export const rotationTrapScenario: GameScenario = {
  description: "Boxes the active piece in through real kit transitions so the next rotate is refused.",
  setup: () => { blockfallDrive().stageRotationTrap(); }
};
