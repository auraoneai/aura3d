export {
  validateAnimationAssets,
  validateGameAssets
} from "./index.js";

export {
  evaluateGameAssetProfile
} from "@aura3d/asset-index";

export type {
  AssetReadinessOptions,
  AssetReadinessReport,
  AssetReadinessAssetReport,
  AssetReadinessValidationContract,
  AuraGameAssetReadinessProfile,
  AnimationEpisodeAssetReadiness,
  AnimationEpisodeAssetRole,
  AnimationEpisodeMouthReadinessMode,
  AnimationEpisodeReadinessReport
} from "./index.js";

export type {
  GameAssetProfile,
  GameAssetProfileEvaluation
} from "@aura3d/asset-index";

export {
  gameAssetProfiles,
  getGameAssetProfileDefinition
} from "./game-asset-profiles.js";

export {
  animationCliAssetProfiles,
  getAnimationAssetProfileDefinition
} from "./animation-asset-profiles.js";

export type {
  AuraCliGameAssetProfile,
  AuraCliGameAssetProfileDefinition
} from "./game-asset-profiles.js";

export type {
  AuraCliAnimationAssetProfile,
  AuraCliAnimationAssetProfileDefinition
} from "./animation-asset-profiles.js";
