// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { createGameRacingTopDownCamera } from "../../index.js";
import { createGameRacingPresentationCamera, type GameRacingCameraRigOptions, type GameScenePresentationCameraSpec } from "../../GameSceneGeometryBindings.js";

export function createGameRacingCameraRig(options: GameRacingCameraRigOptions): GameScenePresentationCameraSpec {
  if (!options.composition.report.trim()) {
    throw new Error("game.racingCameraRig requires an asset-pair composition report path.");
  }
  if (options.composition.verdict !== "pass" || options.composition.cameraReadabilityVerdict !== "pass") {
    throw new Error("game.racingCameraRig requires passing asset-pair composition and camera-readability verdicts.");
  }
  if (options.composition.selectedMode !== options.mode) {
    throw new Error(`game.racingCameraRig mode ${options.mode} conflicts with composition-selected mode ${options.composition.selectedMode}.`);
  }
  const selectedMode = options.mode;
  const camera = selectedMode === "chase"
    ? createGameRacingPresentationCamera({ ...options, mode: "follow" })
    : createGameRacingTopDownCamera(options);
  return {
    ...camera,
    selectionEvidence: {
      source: "asset-pair-composition",
      report: options.composition.report,
      check: "camera-readability",
      verdict: "pass",
      selectedMode
    }
  };
}
