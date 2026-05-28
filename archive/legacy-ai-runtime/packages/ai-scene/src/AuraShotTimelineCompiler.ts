import type { AuraTimelineCue } from "./AuraSceneIR.js";
import type { AuraShotSpec } from "./AuraShotSpec.js";

export interface AuraCompiledShotTimeline {
  readonly durationSeconds: number;
  readonly cues: readonly AuraTimelineCue[];
  readonly diagnostics: readonly string[];
}

export function compileAuraShotTimeline(shots: readonly AuraShotSpec[]): AuraCompiledShotTimeline {
  const cues: AuraTimelineCue[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const startSeconds = cursor;
    const endSeconds = cursor + shot.durationSeconds;
    cues.push({
      id: `cue_${shot.id}_camera`,
      startSeconds,
      endSeconds,
      kind: "camera",
      targetId: shot.camera.id,
      action: shot.movement
    });
    cues.push({
      id: `cue_${shot.id}_blocking`,
      startSeconds: Math.max(startSeconds, endSeconds - Math.min(2, shot.durationSeconds * 0.35)),
      endSeconds,
      kind: "object",
      targetId: "hero",
      action: shot.blockingNotes || "pause-on-discovery"
    });
    cursor = endSeconds;
  }
  return {
    durationSeconds: cursor,
    cues,
    diagnostics: [`Compiled ${shots.length} cinematic shot(s) into ${cues.length} timeline cue(s).`]
  };
}
