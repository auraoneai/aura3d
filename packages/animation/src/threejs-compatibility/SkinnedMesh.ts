import type { SkeletonV5 } from "./Skeleton";

export class SkinnedMeshV5 {
  readonly type = "SkinnedMesh";
  bindMatrixVersion = 1;

  constructor(public readonly skeleton: SkeletonV5, public readonly geometry: unknown = null, public readonly material: unknown = null) {}

  pose(): void {
    this.bindMatrixVersion += 1;
  }
}
