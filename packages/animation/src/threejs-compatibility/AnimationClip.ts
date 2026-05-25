export type V5LoopMode = "once" | "repeat" | "pingpong";

export interface V5KeyframeTrack {
  readonly target: string;
  readonly property: string;
  readonly times: readonly number[];
  readonly values: readonly number[];
}

export class AnimationClipV5 {
  constructor(
    public readonly name: string,
    public readonly duration: number,
    public readonly tracks: readonly V5KeyframeTrack[]
  ) {}
}
