import type { AuraCameraPlan, AuraShotPlan, AuraTimelineCue } from "./AuraSceneIR.js";

export function planShotTimeline(cameras: readonly AuraCameraPlan[], language = "cinematic push-in"): { readonly shots: readonly AuraShotPlan[]; readonly timeline: readonly AuraTimelineCue[] } {
  const movement = language.toLowerCase().includes("orbit") ? "orbit" : language.toLowerCase().includes("truck") ? "truck" : "push-in";
  const camera = cameras[0];
  const cameraId = camera?.id ?? "cam-generated-hero";
  const shot: AuraShotPlan = {
    id: "shot-generated-opening",
    label: "Generated opening shot",
    cameraId,
    startSeconds: 0,
    endSeconds: 6,
    movement,
    notes: `Default ${movement} shot generated from cinematic language.`
  };
  return {
    shots: [shot],
    timeline: [{ id: "cue-generated-camera", startSeconds: 0, endSeconds: 6, kind: "camera", targetId: cameraId, action: movement }]
  };
}
