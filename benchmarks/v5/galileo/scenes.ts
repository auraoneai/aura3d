import { V5_COMPARISON_SCENES } from "../shared/scenes";

export const V5_GALILEO_SCENES = V5_COMPARISON_SCENES.map((scene) => ({
  id: scene.id,
  setupLines: scene.g3dSetupLines,
  drawCalls: scene.g3dDrawCalls,
  frameMs: scene.g3dFrameMs
}));
