import type { SkeletonThreeCompat } from "./Skeleton";

export class SkinnedMeshThreeCompat {
  readonly type = "SkinnedMesh";
  bindMatrixVersion = 1;

  constructor(public readonly skeleton: SkeletonThreeCompat, public readonly geometry: unknown = null, public readonly material: unknown = null) {}

  pose(): void {
    this.bindMatrixVersion += 1;
  }
}
