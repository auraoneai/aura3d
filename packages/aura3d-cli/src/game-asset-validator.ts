export {
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
  AuraGameAssetReadinessProfile
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
  cartoonCliAssetProfiles,
  getCartoonAssetProfileDefinition
} from "./cartoon-asset-profiles.js";

export type {
  AuraCliGameAssetProfile,
  AuraCliGameAssetProfileDefinition
} from "./game-asset-profiles.js";

export type {
  AuraCliCartoonAssetProfile,
  AuraCliCartoonAssetProfileDefinition
} from "./cartoon-asset-profiles.js";
