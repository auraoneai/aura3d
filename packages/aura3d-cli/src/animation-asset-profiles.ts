import type { AnimationAssetProfile } from "@aura3d/asset-index";

export type AuraCliAnimationAssetProfile = AnimationAssetProfile;

export interface AuraCliAnimationAssetProfileDefinition {
  readonly id: AuraCliAnimationAssetProfile;
  readonly label: string;
  readonly category: "character" | "prop" | "set" | "environment";
  readonly requiredMetadata: readonly string[];
  readonly optionalMetadata: readonly string[];
  readonly episodeRequiredMetadata: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly resolveHints: readonly string[];
}

export const animationCliAssetProfiles: readonly AuraCliAnimationAssetProfileDefinition[] = [
  {
    id: "animation-character",
    label: "Animation character",
    category: "character",
    requiredMetadata: ["verified redistributable license", "GLB model", "animation/stylized metadata", "rigged humanoid or skinned character evidence", "embedded animation clips", "checksum"],
    optionalMetadata: ["facial morphs", "mouth bones", "emotion clips", "texture summary", "bounds"],
    episodeRequiredMetadata: ["distinct character hash", "source provenance", "bounds", "readable materials", "animation clips or segmented-rig metadata", "mouth/blendshape/viseme or primitive mouth-card fallback"],
    rejectionReasons: ["static asset", "non-character metadata", "missing rig evidence", "missing animation readiness", "missing mouth/viseme readiness", "unverified license", "missing provenance", "IP-risk metadata", "photoreal scan metadata", "oversized browser payload"],
    resolveHints: ["Use --profile animation-character for animated humanoid or expressive mascot searches.", "Run assets validate-animation --episode after resolve to confirm two-character cast, lip-sync, scale, license, and provenance readiness."],
  },
  {
    id: "animation-prop",
    label: "Animation prop",
    category: "prop",
    requiredMetadata: ["verified redistributable license", "GLB model", "animation/stylized metadata", "prop-like category metadata", "checksum"],
    optionalMetadata: ["bounds", "texture summary", "collision bounds", "triangle budget"],
    episodeRequiredMetadata: ["source provenance", "readable materials", "browser-sized payload"],
    rejectionReasons: ["unverified license", "IP-risk metadata", "photoreal scan metadata", "oversized browser payload", "non-prop metadata"],
    resolveHints: ["Use --profile animation-prop for furniture, vehicles, nature props, tools, toys, and set dressing."],
  },
  {
    id: "animation-set",
    label: "Animation set",
    category: "set",
    requiredMetadata: ["verified redistributable license", "GLB model", "animation/stylized metadata", "set/location metadata", "checksum"],
    optionalMetadata: ["environment-scale bounds", "walkable floor hints", "collision bounds", "thumbnail"],
    episodeRequiredMetadata: ["source provenance", "bounds >= 1.5m", "readable materials", "walkable/framing scale", "browser-sized payload"],
    rejectionReasons: ["unverified license", "missing provenance", "IP-risk metadata", "photoreal scan metadata", "too small for a set", "missing bounds/materials", "oversized browser payload"],
    resolveHints: ["Use --profile animation-set for rooms, parks, schools, streets, stages, and episode locations.", "Run assets validate-animation --episode to prove one set plus two distinct ready characters before rendering."],
  },
  {
    id: "animation-environment",
    label: "Animation environment",
    category: "environment",
    requiredMetadata: ["verified redistributable license", "GLB backdrop/world model", "animation/stylized metadata", "environment/backdrop metadata", "checksum"],
    optionalMetadata: ["large-scale bounds", "skybox/backdrop hints", "thumbnail", "lighting notes"],
    episodeRequiredMetadata: ["source provenance", "large-scale bounds", "browser-sized payload"],
    rejectionReasons: ["unverified license", "IP-risk metadata", "photoreal scan metadata", "non-environment metadata", "oversized browser payload"],
    resolveHints: ["Use --profile animation-environment for skyboxes, backdrops, worlds, terrains, horizons, and large scenic layers."],
  },
];

export function getAnimationAssetProfileDefinition(
  profile: AuraCliAnimationAssetProfile,
): AuraCliAnimationAssetProfileDefinition | undefined {
  return animationCliAssetProfiles.find((candidate) => candidate.id === profile);
}
