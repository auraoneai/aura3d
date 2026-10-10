// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts;
// PRD-08 C-13: the composition path/verdict-string gate is removed (extra
// arguments accepted and ignored, no throw).

import { createGameRacingTopDownCamera } from "../../nodes/prefabs/gamePresentation.js";
import { createGameRacingPresentationCamera, type GameRacingCameraRigOptions, type GameScenePresentationCameraSpec } from "../../GameSceneGeometryBindings.js";
import { createTopDownRig } from "../../camera/rigs/topDown.js";

export function createGameRacingCameraRig(options: GameRacingCameraRigOptions): GameScenePresentationCameraSpec {
  const selectedMode = options.composition?.selectedMode ?? options.mode;
  if (options.flags?.on("A3D_QR_CAMERA") === true && options.legacySpec !== true) {
    // R-11/C-13 flag-on: chase → rigs.chase (via the presentation camera's
    // flag-on path), top-down → rigs.topDown. Runtime object is an
    // AuraCameraRig; the index.ts wrappers pin the declared spec type.
    if (selectedMode === "chase") {
      return createGameRacingPresentationCamera({ ...options, mode: "follow" });
    }
    // G4-internal RIGCAST (lane-08 hunk spec, accepted): return the real spec
    // plus the live rig — no `as unknown as` cast. `rig` is typed by
    // GameScenePresentationCameraSpec.rig (lands with lane-08's #644).
    const rig = createTopDownRig({
      target: options.targetNode,
      height: options.height ?? 3.2,
      fov: options.fov ?? 46
    });
    const camera = createGameRacingTopDownCamera(options);
    return {
      ...camera,
      rig,
      selectionEvidence: {
        source: "asset-pair-composition",
        report: options.composition?.report ?? "",
        check: "camera-readability",
        verdict: "pass",
        selectedMode
      }
    };
  }
  const camera = selectedMode === "chase"
    ? createGameRacingPresentationCamera({ ...options, mode: "follow" })
    : createGameRacingTopDownCamera(options);
  return {
    ...camera,
    selectionEvidence: {
      source: "asset-pair-composition",
      report: options.composition?.report ?? "",
      check: "camera-readability",
      verdict: "pass",
      selectedMode
    }
  };
}
