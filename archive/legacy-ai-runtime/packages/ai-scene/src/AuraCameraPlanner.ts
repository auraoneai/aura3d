import type { AuraCameraPlan } from "./AuraSceneIR.js";

export function planCameraFromLanguage(language: string, sceneId = "scene"): AuraCameraPlan {
  const lower = language.toLowerCase();
  const orbit = lower.includes("orbit");
  const close = lower.includes("close") || lower.includes("macro");
  return {
    id: `cam-${sceneId}-${orbit ? "orbit" : close ? "close" : "hero"}`,
    stableId: `cam-${sceneId}-${orbit ? "orbit" : close ? "close" : "hero"}`,
    label: orbit ? "Orbit camera" : close ? "Close product camera" : "Hero camera",
    kind: "perspective",
    position: orbit ? [3.2, 1.6, 3.2] : close ? [1.9, 1.1, 2.1] : [2.9, 1.5, 3.4],
    target: [0, 0.65, 0],
    focalLengthMm: close ? 70 : 45,
    fovDegrees: close ? 31 : 42
  };
}
