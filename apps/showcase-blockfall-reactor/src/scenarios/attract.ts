/** Attract-mode staging — the deleted ATTRACT_PROBE surface. */
import type { GameScenario } from "@aura3d/engine";
import { blockfallDrive } from "../scenario-drive";

export const attractEnterScenario: GameScenario = {
  description: "Enters the expert-run attract loop immediately (no 45 s idle wait).",
  setup: () => { blockfallDrive().enterAttract("scenario"); }
};

export const attractExitScenario: GameScenario = {
  description: "Exits the attract loop back into a fresh playable game.",
  setup: () => { blockfallDrive().exitAttract("scenario"); }
};
