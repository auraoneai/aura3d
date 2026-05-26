import type { AnimationClip } from "@aura3d/animation";

export interface BlendWeights {
  readonly idle: number;
  readonly walk: number;
  readonly run: number;
}

export interface SkinningBlendControls {
  readonly playing: boolean;
  readonly speed: number;
  readonly orbitYaw: number;
  readonly weights: BlendWeights;
}

export interface SkinningBlendController {
  readonly clipNames: {
    readonly idle: string;
    readonly walk: string;
    readonly run: string;
  };
  normalize(weights: BlendWeights): BlendWeights;
  samples(time: number, weights: BlendWeights): readonly { readonly clipName: string; readonly time: number; readonly weight: number }[];
}

export function createSkinningBlendController(clips: readonly AnimationClip[]): SkinningBlendController {
  const idle = findClip(clips, /^idle$/i, /idle/i);
  const walk = findClip(clips, /^walk$/i, /walk/i);
  const run = findClip(clips, /^run$/i, /run|running/i);
  return {
    clipNames: { idle: idle.name, walk: walk.name, run: run.name },
    normalize,
    samples: (time, weights) => {
      const next = normalize(weights);
      return [
        { clipName: idle.name, time: wrap(time, idle.duration), weight: next.idle },
        { clipName: walk.name, time: wrap(time, walk.duration), weight: next.walk },
        { clipName: run.name, time: wrap(time, run.duration), weight: next.run }
      ];
    }
  };
}

function findClip(clips: readonly AnimationClip[], exact: RegExp, fallback: RegExp): AnimationClip {
  const clip = clips.find((item) => exact.test(item.name)) ?? clips.find((item) => fallback.test(item.name)) ?? clips[0];
  if (!clip) {
    throw new Error("Skinning blend route requires at least one animation clip.");
  }
  return clip;
}

function normalize(weights: BlendWeights): BlendWeights {
  const idle = clamp(weights.idle);
  const walk = clamp(weights.walk);
  const run = clamp(weights.run);
  const total = idle + walk + run;
  if (total <= 0.0001) {
    return { idle: 1, walk: 0, run: 0 };
  }
  return {
    idle: idle / total,
    walk: walk / total,
    run: run / total
  };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function wrap(time: number, duration: number): number {
  return duration > 0 ? time % duration : 0;
}
