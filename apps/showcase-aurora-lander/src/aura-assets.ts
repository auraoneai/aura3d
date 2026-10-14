import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraGeneratedAssetDefinitions = {
  readonly auroraExtractionBayBackdrop: AuraAssetDefinition & {
    readonly type: "model";
    readonly format: "glb";
    readonly url: string;
    readonly hash: string;
    readonly bounds: readonly [number, number, number];
  };
  readonly auroraExtractionLanderHero: AuraAssetDefinition & {
    readonly type: "model";
    readonly format: "glb";
    readonly url: string;
    readonly hash: string;
    readonly bounds: readonly [number, number, number];
  };
  readonly auroraLanderProbe: AuraAssetDefinition & {
    readonly type: "model";
    readonly format: "glb";
    readonly url: string;
    readonly hash: string;
    readonly bounds: readonly [number, number, number];
  };
  readonly auroraPadBeacon: AuraAssetDefinition & {
    readonly type: "model";
    readonly format: "glb";
    readonly url: string;
    readonly hash: string;
    readonly bounds: readonly [number, number, number];
  };
};

export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({
  auroraExtractionBayBackdrop: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraExtractionBayBackdrop.23ba5959.glb",
    hash: "sha256-23ba59592c969605e2647a5120da3c7582fd433af2c00e308c0f4a75bd772ff7",
    bounds: [16, 10.008, 0.2],
    sizeBytes: 2351972,
    metadata: {
      materials: ["aurora-extraction-bay-unlit"],
      animations: [],
      animationClips: [],
      humanoid: false,
      humanoidStatus: "non-humanoid",
      humanoidConfidence: "low",
      sourcePath: "../../apps/showcase-aurora-lander/generated/auroraExtractionBay.glb",
      outputPath: "public/aura-assets/auroraExtractionBayBackdrop.23ba5959.glb",
      license: "CC0-1.0",
      author: "Aura3D art pipeline (OpenAI image generation)",
      quality: "prototype",
      role: "proxy",
    },
  },
  auroraExtractionLanderHero: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraExtractionLanderHero.4b12940e.glb",
    hash: "sha256-4b12940e15ea6e51d0bc71b3382b0364526bb16bb29f60dd72e8f8fb1735a2e1",
    bounds: [1.072, 1, 0.05],
    sizeBytes: 1034600,
    metadata: {
      materials: ["aurora-extraction-lander-unlit-alpha"],
      animations: [],
      animationClips: [],
      humanoid: false,
      humanoidStatus: "non-humanoid",
      humanoidConfidence: "low",
      sourcePath: "../../apps/showcase-aurora-lander/generated/auroraExtractionLander.glb",
      outputPath: "public/aura-assets/auroraExtractionLanderHero.4b12940e.glb",
      license: "CC0-1.0",
      author: "Aura3D art pipeline (OpenAI image generation)",
      quality: "prototype",
      role: "proxy",
    },
  },
  auroraLanderProbe: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraLanderProbe.bff8e15b.glb",
    hash: "sha256-bff8e15b8a4004d6631f42d55d2b5d664b3fe77c1564c9fa7def85dcd61b40cd",
    bounds: [1.314, 1.04, 1.2],
    sizeBytes: 41728,
    metadata: {
      materials: [
        "hull-material",
        "nozzle-material",
        "legs-material",
        "gear-material",
      ],
      animations: [],
      animationClips: [],
      humanoid: false,
      humanoidStatus: "non-humanoid",
      humanoidConfidence: "low",
      sourcePath: "../../apps/showcase-aurora-lander/assets/models/auroraLanderProbe.glb",
      outputPath: "public/aura-assets/auroraLanderProbe.bff8e15b.glb",
      license: "CC0-1.0",
      author: "Aura3D synthesis",
      quality: "candidate",
      role: "vehicle",
    },
  },
  auroraPadBeacon: {
    type: "model",
    format: "glb",
    url: "/aura-assets/auroraPadBeacon.c94a5b6b.glb",
    hash: "sha256-c94a5b6b45fa0c3d52fa5c9b3e863aaa37c540e1d9fb57ec09c46956f4af14ef",
    bounds: [0.6, 0.98, 0.52],
    sizeBytes: 7948,
    metadata: {
      materials: ["base-material", "pylon-material", "lamp-material"],
      animations: [],
      animationClips: [],
      humanoid: false,
      humanoidStatus: "non-humanoid",
      humanoidConfidence: "low",
      sourcePath: "../../apps/showcase-aurora-lander/assets/models/auroraPadBeacon.glb",
      outputPath: "public/aura-assets/auroraPadBeacon.c94a5b6b.glb",
      license: "CC0-1.0",
      author: "Aura3D synthesis",
      quality: "candidate",
      role: "prop",
    },
  },
});

export type AuraAssetId = keyof AuraGeneratedAssetDefinitions;
