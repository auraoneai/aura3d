import { gameAssetProfileDefinitions, type GameAssetProfile } from "@aura3d/asset-index";

export type AuraCliGameAssetProfile =
  | GameAssetProfile
  | "animated-humanoid"
  | "arena-prop"
  | "environment-skybox"
  | "audio-sfx";

export interface AuraCliGameAssetProfileDefinition {
  readonly id: AuraCliGameAssetProfile;
  readonly label: string;
  readonly requiredMetadata: readonly string[];
  readonly optionalMetadata: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly scoring?: unknown;
}

export const gameAssetProfiles: readonly AuraCliGameAssetProfileDefinition[] = [
  ...gameAssetProfileDefinitions,
  {
    id: "animated-humanoid",
    label: "Animated humanoid",
    requiredMetadata: ["verified redistributable license", "GLB/glTF model", "skeleton evidence", "embedded animation clips", "checksum"],
    optionalMetadata: ["bounds", "texture summary", "morph targets"],
    rejectionReasons: ["static asset", "missing skeleton", "missing clips", "unverified license"]
  },
  {
    id: "arena-prop",
    label: "Arena prop",
    requiredMetadata: ["verified redistributable license", "GLB/glTF model", "bounds", "checksum"],
    optionalMetadata: ["texture summary", "collision bounds", "triangle budget"],
    rejectionReasons: ["unverified license", "missing bounds", "oversized browser payload"]
  },
  {
    id: "environment-skybox",
    label: "Environment skybox",
    requiredMetadata: ["verified redistributable license", "image or HDR environment", "checksum"],
    optionalMetadata: ["resolution", "dynamic range", "color-space metadata"],
    rejectionReasons: ["unverified license", "missing image/HDR payload", "oversized texture"]
  },
  {
    id: "audio-sfx",
    label: "Audio SFX",
    requiredMetadata: ["verified redistributable license", "audio file", "duration", "checksum"],
    optionalMetadata: ["loudness", "loop points", "bus mapping"],
    rejectionReasons: ["unverified license", "missing audio payload", "oversized audio file"]
  }
];

export function getGameAssetProfileDefinition(
  profile: AuraCliGameAssetProfile
): AuraCliGameAssetProfileDefinition | undefined {
  return gameAssetProfiles.find((candidate) => candidate.id === profile);
}
