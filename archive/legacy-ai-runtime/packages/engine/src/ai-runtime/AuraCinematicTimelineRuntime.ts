import type { AuraCameraPlan, AuraShotPlan, AuraTimelineCue } from "@aura3d/ai-scene";
import { createAuraCameraShotRuntime, type AuraCameraShotRuntime } from "./AuraCameraShotRuntime.js";
import { createAuraTimelineScrubber, type AuraTimelineScrubber } from "./AuraTimelineScrubber.js";

export interface AuraCinematicTimelineRuntime {
  readonly durationSeconds: number;
  readonly cameraShots: readonly AuraCameraShotRuntime[];
  readonly cues: readonly AuraTimelineCue[];
  readonly scrubber: AuraTimelineScrubber;
}

export function createAuraCinematicTimelineRuntime(input: {
  readonly cameras: readonly AuraCameraPlan[];
  readonly shots: readonly AuraShotPlan[];
  readonly cues: readonly AuraTimelineCue[];
}): AuraCinematicTimelineRuntime {
  const cameras = new Map(input.cameras.map((camera) => [camera.id, camera]));
  const cameraShots = input.shots.flatMap((shot) => {
    const camera = cameras.get(shot.cameraId) ?? input.cameras[0];
    return camera ? [createAuraCameraShotRuntime({ camera, shot })] : [];
  });
  const durationSeconds = Math.max(
    0.001,
    ...input.shots.map((shot) => shot.endSeconds),
    ...input.cues.map((cue) => cue.endSeconds)
  );
  return {
    durationSeconds,
    cameraShots,
    cues: input.cues,
    scrubber: createAuraTimelineScrubber(durationSeconds)
  };
}
