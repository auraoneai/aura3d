import { THREE_COMPAT_COMPARISON_SCENES } from "../shared/scenes";

export const THREE_COMPAT_THREEJS_SCENES = THREE_COMPAT_COMPARISON_SCENES.map((scene) => ({
  id: scene.id,
  setupLines: scene.threeSetupLines,
  drawCalls: scene.threeDrawCalls,
  frameMs: scene.threeFrameMs
}));
