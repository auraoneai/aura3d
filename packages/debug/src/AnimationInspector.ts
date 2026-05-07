import type { AnimationMixer, AnimationMixerSnapshot, Skeleton } from "@galileo3d/animation";

export type SkeletonDebugSnapshot = {
  readonly boneCount: number;
  readonly boneNames: readonly string[];
  readonly paletteMatrixCount: number;
};

export type AnimationDebugSnapshot = {
  readonly mixer: AnimationMixerSnapshot;
  readonly skeleton?: SkeletonDebugSnapshot;
};

export type AnimationVisualEvidence = {
  readonly actionCount: number;
  readonly playingActionCount: number;
  readonly sampledTargetCount: number;
  readonly sampledTargets: readonly string[];
  readonly skeletonBoneCount: number;
  readonly paletteMatrixCount: number;
  readonly paletteHash?: string;
  readonly stableHash: string;
};

export class AnimationInspector {
  snapshot(mixer: Pick<AnimationMixer, "snapshot">, skeleton?: Skeleton): AnimationDebugSnapshot {
    const snapshot: AnimationDebugSnapshot = {
      mixer: mixer.snapshot()
    };
    if (skeleton) {
      return {
        ...snapshot,
        skeleton: {
        boneCount: skeleton.bones.length,
        boneNames: skeleton.bones.map((bone) => bone.name),
        paletteMatrixCount: skeleton.matrixPalette().length
        }
      };
    }
    return snapshot;
  }

  visualEvidence(mixer: Pick<AnimationMixer, "snapshot">, skeleton?: Skeleton): AnimationVisualEvidence {
    const snapshot = mixer.snapshot();
    const sampledTargets = Object.keys(snapshot.values).sort();
    const palette = skeleton?.matrixPalette();
    const evidenceWithoutHash = {
      actionCount: snapshot.actionCount,
      playingActionCount: snapshot.actions.filter((action) => action.playing).length,
      sampledTargetCount: sampledTargets.length,
      sampledTargets,
      skeletonBoneCount: skeleton?.bones.length ?? 0,
      paletteMatrixCount: palette?.length ?? 0,
      ...(palette ? { paletteHash: stableHash(palette.map((matrix) => matrix.map((value) => Number(value.toFixed(6))))) } : {})
    };
    return {
      ...evidenceWithoutHash,
      stableHash: stableHash(evidenceWithoutHash)
    };
  }
}

function stableHash(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
