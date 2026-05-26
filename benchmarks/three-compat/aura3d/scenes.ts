import { THREE_COMPAT_COMPARISON_SCENES } from "../shared/scenes";

export const THREE_COMPAT_AURA3D_SCENES = THREE_COMPAT_COMPARISON_SCENES.map((scene) => ({
  id: scene.id,
  setupLines: scene.a3dSetupLines,
  drawCalls: scene.a3dDrawCalls,
  frameMs: scene.a3dFrameMs
}));
