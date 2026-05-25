import { V5_COMPARISON_SCENES } from "../shared/scenes";

export const V5_THREEJS_SCENES = V5_COMPARISON_SCENES.map((scene) => ({
  id: scene.id,
  setupLines: scene.threeSetupLines,
  drawCalls: scene.threeDrawCalls,
  frameMs: scene.threeFrameMs
}));
