import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "@aura3d/rendering";
import type { AuraSceneObject, AuraTimelineCue, AuraVec3 } from "@aura3d/ai-scene";

export type AuraCharacterBlockingAction = "look-at" | "reach-toward" | "turn-to-prop" | "pause-on-discovery";

export interface AuraCharacterBlockingPose {
  readonly cueId: string;
  readonly characterId: string;
  readonly action: AuraCharacterBlockingAction;
  readonly targetId: string;
  readonly attentionDirection: AuraVec3;
  readonly weight: number;
}

export interface AuraCharacterBlockingRuntime {
  readonly poses: readonly AuraCharacterBlockingPose[];
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  sample(timeSeconds: number): readonly AuraCharacterBlockingPose[];
}

export function createAuraCharacterBlockingRuntime(input: {
  readonly characters: readonly AuraSceneObject[];
  readonly objects: readonly AuraSceneObject[];
  readonly cues: readonly AuraTimelineCue[];
}): AuraCharacterBlockingRuntime {
  const objects = new Map([...input.characters, ...input.objects].map((object) => [object.id, object]));
  const firstCharacter = input.characters[0];
  const poses = input.cues.flatMap((cue) => {
    const action = normalizeBlockingAction(cue.action);
    if (!action || !firstCharacter) return [];
    const target = objects.get(cue.targetId);
    return [{
      cueId: cue.id,
      characterId: firstCharacter.id,
      action,
      targetId: cue.targetId,
      attentionDirection: target ? direction(firstCharacter.transform.position, target.transform.position) : [0, 0, -1] as AuraVec3,
      weight: 1
    }];
  });
  return {
    poses,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: "blocking:character",
      feature: "blocking",
      label: "Character blocking runtime",
      source: "renderer-timeline",
      diagnostics: ["Character look/reach/turn/pause cues are compiled as runtime pose intent."]
    }),
    sample(timeSeconds: number) {
      return poses.filter((pose) => {
        const cue = input.cues.find((entry) => entry.id === pose.cueId);
        return cue ? timeSeconds >= cue.startSeconds && timeSeconds <= cue.endSeconds : true;
      });
    }
  };
}

function normalizeBlockingAction(action: string): AuraCharacterBlockingAction | undefined {
  const value = action.toLowerCase();
  if (value.includes("look")) return "look-at";
  if (value.includes("reach")) return "reach-toward";
  if (value.includes("turn")) return "turn-to-prop";
  if (value.includes("pause") || value.includes("discover")) return "pause-on-discovery";
  return undefined;
}

function direction(from: AuraVec3, to: AuraVec3): AuraVec3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  return [dx / length, dy / length, dz / length];
}
