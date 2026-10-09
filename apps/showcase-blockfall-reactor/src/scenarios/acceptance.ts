/** Exact acceptance staging — the deleted ACCEPTANCE_PROBE.apply surface. */
import type { GameScenario } from "@aura3d/engine";
import { blockfallDrive, type BlockfallAcceptanceScenario } from "../scenario-drive";

function acceptance(id: BlockfallAcceptanceScenario, description: string): GameScenario {
  return {
    description,
    setup: () => { blockfallDrive().applyAcceptance(id); }
  };
}

export const playScenario = acceptance("play", "Deterministic opening board: T piece mid-field.");
export const singleClearScenario = acceptance("single-clear", "O hard-drop that clears exactly one line.");
export const quadScenario = acceptance("quad", "Vertical I quad clear with a live follow-through piece.");
export const levelUpScenario = acceptance("level-up", "Ten cleared lines across three quads; level-up beat armed.");
export const dangerScenario = acceptance("danger", "Stepped stack near the top-out threshold.");
export const gameOverScenario = acceptance("game-over", "Spawn band occupied; next lock emits game-over.");
