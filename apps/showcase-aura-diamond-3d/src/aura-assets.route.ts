// Route audio asset definitions for Aura Diamond 3D (100% procedural @aura3d/engine geometry, zero GLB models).
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraAudioAsset = AuraAssetDefinition & {
  readonly type: "audio";
  readonly format: "wav";
  readonly url: string;
  readonly hash: string;
  readonly sizeBytes: number;
};

type AuraGeneratedRouteAssetDefinitions = {
  readonly "diamondBatCrackSfx": AuraAudioAsset;
  readonly "diamondClickSfx": AuraAudioAsset;
  readonly "diamondConfirmSfx": AuraAudioAsset;
  readonly "diamondContactSfx": AuraAudioAsset;
  readonly "diamondCrowdSfx": AuraAudioAsset;
  readonly "diamondFoulSfx": AuraAudioAsset;
  readonly "diamondHomerBigSfx": AuraAudioAsset;
  readonly "diamondHomerSfx": AuraAudioAsset;
  readonly "diamondMittPopSfx": AuraAudioAsset;
  readonly "diamondOrganSfx": AuraAudioAsset;
  readonly "diamondPitchWhooshSfx": AuraAudioAsset;
  readonly "diamondQuadSfx": AuraAudioAsset;
  readonly "diamondStrikeoutSfx": AuraAudioAsset;
  readonly "diamondSwingSfx": AuraAudioAsset;
  readonly "diamondWalkSfx": AuraAudioAsset;
  readonly "diamondWindSfx": AuraAudioAsset;
};

export const assets: AuraAssetMap<AuraGeneratedRouteAssetDefinitions> = defineAuraAssets({
  "diamondBatCrackSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondBatCrackSfx.88a94e48.wav",
    hash: "sha256-88a94e482bae8fe13f086f4c503d15f02f4d5108e695bda9b2c67e0b1d083dae",
    bounds: [0, 0, 0],
    sizeBytes: 30914
  },
  "diamondClickSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondClickSfx.6a970d1d.wav",
    hash: "sha256-6a970d1d51543575e978c9735afa795d6eb6f086faa7cadfc19d9ee834fe39da",
    bounds: [0, 0, 0],
    sizeBytes: 7982
  },
  "diamondConfirmSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondConfirmSfx.70982d28.wav",
    hash: "sha256-70982d2827bd33a15e2ba174d40133aa21bea3b879bcf19e8da5714cb6693843",
    bounds: [0, 0, 0],
    sizeBytes: 30914
  },
  "diamondContactSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondContactSfx.437f8f24.wav",
    hash: "sha256-437f8f2452f1124caebb05a463b7982f301160d33204f9efe1f8d1089b5af99c",
    bounds: [0, 0, 0],
    sizeBytes: 22094
  },
  "diamondCrowdSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondCrowdSfx.d68cf36a.wav",
    hash: "sha256-d68cf36aa84536dd799c3558c9c7196029dde79866c92da2a60b8b6f96686e85",
    bounds: [0, 0, 0],
    sizeBytes: 396944
  },
  "diamondFoulSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondFoulSfx.4197695d.wav",
    hash: "sha256-4197695d5e282f641575269ba8390150d2a1365af5f54ba55ee7df72aa05977b",
    bounds: [0, 0, 0],
    sizeBytes: 39734
  },
  "diamondHomerBigSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondHomerBigSfx.7d3a6654.wav",
    hash: "sha256-7d3a66547131d29df72f20b49b11c258d55985550bb5004763eb25cf1979ee38",
    bounds: [0, 0, 0],
    sizeBytes: 141164
  },
  "diamondHomerSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondHomerSfx.b9ff0287.wav",
    hash: "sha256-b9ff02872e287670cece2f24e8a066f122d799ee6014e049c3d73b40a974714a",
    bounds: [0, 0, 0],
    sizeBytes: 105884
  },
  "diamondMittPopSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondMittPopSfx.6850f890.wav",
    hash: "sha256-6850f890ee2169a3e610b7d5f12d5b104403782cbd31e79f24ffe245f814aaa1",
    bounds: [0, 0, 0],
    sizeBytes: 19448
  },
  "diamondOrganSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondOrganSfx.f69fb9ee.wav",
    hash: "sha256-f69fb9eea4b79190bf071b53da420019dd0185ef5fdf18927dc0801f06990f90",
    bounds: [0, 0, 0],
    sizeBytes: 88244
  },
  "diamondPitchWhooshSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondPitchWhooshSfx.f9b60fb6.wav",
    hash: "sha256-f9b60fb6928f64f3c63d78429a095a2ecf724eab0f749c6c8487f2184a281aa1",
    bounds: [0, 0, 0],
    sizeBytes: 26504
  },
  "diamondQuadSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondQuadSfx.6313fa1b.wav",
    hash: "sha256-6313fa1b0c94860aee9f273da9eca68eae18a06578847fc015b5b9ce9553758f",
    bounds: [0, 0, 0],
    sizeBytes: 123524
  },
  "diamondStrikeoutSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondStrikeoutSfx.3c574e23.wav",
    hash: "sha256-3c574e2312d2b879684df9339435b95c290e3655ec8e5e30f5c54c3a226c16e3",
    bounds: [0, 0, 0],
    sizeBytes: 70604
  },
  "diamondSwingSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondSwingSfx.4411a5a3.wav",
    hash: "sha256-4411a5a32e31887e1dc8bcaff8a9642cb0153ad4310eb6ce88e86284de1d958a",
    bounds: [0, 0, 0],
    sizeBytes: 30914
  },
  "diamondWalkSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondWalkSfx.a178409a.wav",
    hash: "sha256-a178409abe103bfd2dee18d901011e5395186c0cebc79e8973714a50aec6c5f3",
    bounds: [0, 0, 0],
    sizeBytes: 44144
  },
  "diamondWindSfx": {
    type: "audio",
    format: "wav",
    url: "/aura-assets/diamondWindSfx.777b552e.wav",
    hash: "sha256-777b552ec33867309e0ee2a64af85e6ba9ad0b8f217721f19c3edbe7dcfcc23c",
    bounds: [0, 0, 0],
    sizeBytes: 308744
  }
} as const);

export type AuraGeneratedRouteAssets = typeof assets;
