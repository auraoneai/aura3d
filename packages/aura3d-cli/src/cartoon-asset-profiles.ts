import type { CartoonAssetProfile } from "@aura3d/asset-index";

export type AuraCliCartoonAssetProfile = CartoonAssetProfile;

export interface AuraCliCartoonAssetProfileDefinition {
  readonly id: AuraCliCartoonAssetProfile;
  readonly label: string;
  readonly category: "character" | "prop" | "set" | "environment";
  readonly requiredMetadata: readonly string[];
  readonly optionalMetadata: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly resolveHints: readonly string[];
}

export const cartoonCliAssetProfiles: readonly AuraCliCartoonAssetProfileDefinition[] = [
  {
    id: "cartoon-character",
    label: "Cartoon character",
    category: "character",
    requiredMetadata: ["verified redistributable license", "GLB model", "cartoon/stylized metadata", "rigged humanoid or skinned character evidence", "embedded animation clips", "checksum"],
    optionalMetadata: ["facial morphs", "mouth bones", "emotion clips", "texture summary", "bounds"],
    rejectionReasons: ["static asset", "non-character metadata", "missing rig evidence", "unverified license", "IP-risk metadata", "photoreal scan metadata", "oversized browser payload"],
    resolveHints: ["Use --profile cartoon-character for animated humanoid or expressive mascot searches.", "Run assets validate-cartoon after resolve to confirm lip-sync and scale readiness."],
  },
  {
    id: "cartoon-prop",
    label: "Cartoon prop",
    category: "prop",
    requiredMetadata: ["verified redistributable license", "GLB model", "cartoon/stylized metadata", "prop-like category metadata", "checksum"],
    optionalMetadata: ["bounds", "texture summary", "collision bounds", "triangle budget"],
    rejectionReasons: ["unverified license", "IP-risk metadata", "photoreal scan metadata", "oversized browser payload", "non-prop metadata"],
    resolveHints: ["Use --profile cartoon-prop for furniture, vehicles, nature props, tools, toys, and set dressing."],
  },
  {
    id: "cartoon-set",
    label: "Cartoon set",
    category: "set",
    requiredMetadata: ["verified redistributable license", "GLB model", "cartoon/stylized metadata", "set/location metadata", "checksum"],
    optionalMetadata: ["environment-scale bounds", "walkable floor hints", "collision bounds", "thumbnail"],
    rejectionReasons: ["unverified license", "IP-risk metadata", "photoreal scan metadata", "too small for a set", "oversized browser payload"],
    resolveHints: ["Use --profile cartoon-set for rooms, parks, schools, streets, stages, and episode locations."],
  },
  {
    id: "cartoon-environment",
    label: "Cartoon environment",
    category: "environment",
    requiredMetadata: ["verified redistributable license", "GLB backdrop/world model", "cartoon/stylized metadata", "environment/backdrop metadata", "checksum"],
    optionalMetadata: ["large-scale bounds", "skybox/backdrop hints", "thumbnail", "lighting notes"],
    rejectionReasons: ["unverified license", "IP-risk metadata", "photoreal scan metadata", "non-environment metadata", "oversized browser payload"],
    resolveHints: ["Use --profile cartoon-environment for skyboxes, backdrops, worlds, terrains, horizons, and large scenic layers."],
  },
];

export function getCartoonAssetProfileDefinition(
  profile: AuraCliCartoonAssetProfile,
): AuraCliCartoonAssetProfileDefinition | undefined {
  return cartoonCliAssetProfiles.find((candidate) => candidate.id === profile);
}
