export type ThreeCompatLoopMode = "once" | "repeat" | "pingpong";

export interface ThreeCompatKeyframeTrack {
  readonly target: string;
  readonly property: string;
  readonly times: readonly number[];
  readonly values: readonly number[];
}

export class AnimationClipThreeCompat {
  constructor(
    public readonly name: string,
    public readonly duration: number,
    public readonly tracks: readonly ThreeCompatKeyframeTrack[]
  ) {}
}
