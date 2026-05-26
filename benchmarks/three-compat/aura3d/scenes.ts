import { V5_COMPARISON_SCENES } from "../shared/scenes";

export const V5_AURA3D_SCENES = V5_COMPARISON_SCENES.map((scene) => ({
  id: scene.id,
  setupLines: scene.a3dSetupLines,
  drawCalls: scene.a3dDrawCalls,
  frameMs: scene.a3dFrameMs
}));
