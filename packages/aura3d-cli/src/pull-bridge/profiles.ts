import * as assetIndex from "@aura3d/asset-index";
import type {
  AnimationAssetProfile,
  AuraCanonicalAsset,
  ResolveCandidate,
  ResolveConstraints,
} from "@aura3d/asset-index";
import type {
  CliAssetSearchProfile,
  CliResolveConstraints,
} from "./types.js";

const {
  evaluateAnimationAssetProfile,
  evaluateGameAssetProfile,
  isAnimationAssetProfile,
} = assetIndex;

export function toResolveConstraints(
  cli: CliResolveConstraints,
  redistributableOnly: boolean,
): ResolveConstraints {
  const constraints: {
    license?: readonly ("CC0" | "CC-BY")[];
    maxTriangles?: number;
    animated?: boolean;
    format?: "glb" | "gltf";
    redistributableOnly?: boolean;
  } = {};
  if (cli.profile === "fighting-character") {
    constraints.license = cli.license && cli.license.length > 0 ? cli.license : ["CC0", "CC-BY"];
    constraints.animated = true;
    constraints.format = "glb";
    constraints.maxTriangles = cli.maxTriangles ?? 200_000;
  } else if (isAnimationCliProfile(cli.profile)) {
    constraints.license = cli.license && cli.license.length > 0 ? cli.license : ["CC0", "CC-BY"];
    constraints.format = "glb";
    constraints.maxTriangles = cli.maxTriangles ?? animationProfileMaxTriangles(cli.profile);
    if (cli.profile === "animation-character") constraints.animated = true;
    else if (typeof cli.animated === "boolean") constraints.animated = cli.animated;
  } else {
    if (cli.license && cli.license.length > 0) constraints.license = cli.license;
    if (typeof cli.maxTriangles === "number") constraints.maxTriangles = cli.maxTriangles;
    if (typeof cli.animated === "boolean") constraints.animated = cli.animated;
  }
  if (redistributableOnly) constraints.redistributableOnly = true;
  return constraints;
}

export function rankForProfile(
  candidates: readonly ResolveCandidate[],
  profile: CliAssetSearchProfile,
): readonly ResolveCandidate[] {
  if (profile === "general") return candidates;
  return [...candidates].sort((a, b) => {
    const aEval = evaluateAssetProfile(a.asset, profile);
    const bEval = evaluateAssetProfile(b.asset, profile);
    return (
      Number(bEval.suitable) - Number(aEval.suitable) ||
      (b.score + bEval.scoreBonus) - (a.score + aEval.scoreBonus) ||
      a.asset.id.localeCompare(b.asset.id)
    );
  });
}

export function isAnimationCliProfile(profile: CliAssetSearchProfile | undefined): profile is AnimationAssetProfile {
  return typeof profile === "string" && isAnimationAssetProfile(profile);
}

export function evaluateAssetProfile(
  asset: AuraCanonicalAsset,
  profile: Exclude<CliAssetSearchProfile, "general">,
): { readonly suitable: boolean; readonly scoreBonus: number; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[]; readonly validationHooks?: readonly string[] } {
  return profile === "fighting-character"
    ? evaluateGameAssetProfile(asset, "fighting-character")
    : evaluateAnimationAssetProfile(asset, profile, { preDownload: true });
}

export function animationProfileMaxTriangles(profile: AnimationAssetProfile): number {
  switch (profile) {
    case "animation-character":
      return 160_000;
    case "animation-prop":
      return 100_000;
    case "animation-set":
      return 350_000;
    case "animation-environment":
      return 250_000;
  }
}
