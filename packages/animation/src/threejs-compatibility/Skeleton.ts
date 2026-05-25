export interface V5Bone {
  readonly name: string;
  readonly parentIndex: number;
}

export class SkeletonV5 {
  constructor(public readonly bones: readonly V5Bone[]) {}
  get boneCount(): number { return this.bones.length; }
}
