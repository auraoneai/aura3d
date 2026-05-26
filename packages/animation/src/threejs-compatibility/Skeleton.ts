export interface ThreeCompatBone {
  readonly name: string;
  readonly parentIndex: number;
}

export class SkeletonThreeCompat {
  constructor(public readonly bones: readonly ThreeCompatBone[]) {}
  get boneCount(): number { return this.bones.length; }
}
