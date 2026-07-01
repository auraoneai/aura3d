import type { AnimationAssetProfile } from "@aura3d/asset-index";

export type CliAssetSearchProfile =
  | "general"
  | "fighting-character"
  | AnimationAssetProfile;

export interface CliResolveConstraints {
  readonly license?: readonly ("CC0" | "CC-BY")[];
  readonly maxTriangles?: number;
  readonly animated?: boolean;
  readonly profile?: CliAssetSearchProfile;
}
