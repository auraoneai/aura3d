import { defineAuraAssets } from "@aura3d/engine";

// Coherent typed asset set for the single-path Neon Swarm rebuild: the hero
// courier avatar, street barricade obstacle, and street lamp landmark, plus
// the thirteen synthesized WAV cues. Every entry mirrors an asset already
// admitted in the repo-root aura.assets.json (same id, url, and sha256),
// served from the shared public/aura-assets tree.
export const assets = defineAuraAssets({
  neonCourierAvatar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/neonCourierAvatar.6ac2371a.glb",
    bounds: [1.742, 2.231, 0.385],
    hash: "sha256-6ac2371a41d80273ef0c6467e1f50f8eb3f6b6d639e1000768a78f83c4cdf1e7",
    metadata: {
      materials: ["Base1Malesecondary_mat", "Base1Malelambert2", "Base1Maleglow_mat"],
      animations: [],
      textures: [],
      license: "CC-BY-4.0",
      attribution: "Daniel Darko"
    }
  },
  neonBarricadeProp: {
    type: "model",
    format: "glb",
    url: "/aura-assets/neonBarricadeProp.81e5f972.glb",
    bounds: [1.26, 2, 1.616],
    hash: "sha256-81e5f972fb3d6b6a0c33f30e1eb57f22bd3bcdd4f77f696ccd7b96b24cfa846b",
    metadata: {
      materials: ["lambert1"],
      animations: [],
      textures: ["image-0", "image-1", "image-2", "image-3"],
      license: "CC-BY-4.0",
      attribution: "Kyle Burton"
    }
  },
  neonStreetLampProp: {
    type: "model",
    format: "glb",
    url: "/aura-assets/neonStreetLampProp.1c0ed5ac.glb",
    bounds: [1206.754, 2835.063, 1159.3],
    hash: "sha256-1c0ed5ac46e535406f00a485c38d9fdbf1618a29b0a84647120cb76c6f8c4d8c",
    metadata: {
      materials: [
        "Top_metal",
        "Glass",
        "Material.028",
        "Material.025",
        "Material.022",
        "Material.024",
        "Material.027",
        "Material.023",
        "Material.026",
        "Material.002",
        "Material.004",
        "Material.003",
        "lampbase",
        "Lamppost_body",
        "fresh_palm.004"
      ],
      animations: [],
      textures: [
        "image-0",
        "image-1",
        "image-2",
        "image-3",
        "image-4",
        "image-5",
        "image-6",
        "image-7",
        "image-8"
      ],
      license: "CC-BY-4.0",
      attribution: "Humphrorange"
    }
  },
  neonPulseFireSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonPulseFireSfx.a6d6a27d.wav",
    hash: "sha256-a6d6a27d10c2e277301aa46c04d747cee24efa0ab32715d0fc0fddcf4e5e694b"
  },
  neonDroneHitSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonDroneHitSfx.c8c7062b.wav",
    hash: "sha256-c8c7062b9e478b6c83e3623bec3e6247f347d0521991e07a0ae70dede5dc9d10"
  },
  neonDroneDieSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonDroneDieSfx.36f67fa9.wav",
    hash: "sha256-36f67fa962e4e8626c2a281dc621401f125ab55a0ab834ae3401c7a5354b323e"
  },
  neonPlayerHurtSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonPlayerHurtSfx.82be1a45.wav",
    hash: "sha256-82be1a45f712d5fa55b1ffe977afd6cb1b16411d80a0bf27da42d2b33c0b52ea"
  },
  neonDashSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonDashSfx.6ecbe0b7.wav",
    hash: "sha256-6ecbe0b7b763a99b83c5d608fcee868fc3bd340e72a30a38cbd6af08a4ea29a3"
  },
  neonPickupSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonPickupSfx.29768e13.wav",
    hash: "sha256-29768e13ff6b885fe5c5369f4c75e4de18b3faab435275facaa0c8c3e58b26b8"
  },
  neonWaveStartSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonWaveStartSfx.5cb715d6.wav",
    hash: "sha256-5cb715d680b1f627d3594bee45570c7ab1844f7c56711a0b6b83febae029b04c"
  },
  neonWaveClearSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonWaveClearSfx.e5b9140a.wav",
    hash: "sha256-e5b9140a9815ae564fd3eb9ceb3224565ba3734313225ee776f87113fc454fbf"
  },
  neonDeathStingSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonDeathStingSfx.aafc5e30.wav",
    hash: "sha256-aafc5e30ab6428d0972e276d31ec9011c720770b72724783f2bc5b3dfbc9efd1"
  },
  neonAmbientHumSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonAmbientHumSfx.47e7df8e.wav",
    hash: "sha256-47e7df8ed1cd192946de34df99aa0c2b5fc9ba27847824c449aea2c12fbf3bcf"
  },
  neonBurstSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonBurstSfx.73688264.wav",
    hash: "sha256-73688264b83094638127d0a21fd827044afea541b0e91e9c14ce6fe4ea22cda2"
  },
  neonGrazeSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonGrazeSfx.61165978.wav",
    hash: "sha256-61165978deae695e41eced6d4b25fb6df188c000cfed6ab9e24704b1715e0421"
  },
  neonComboBreakSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/neonComboBreakSfx.a3f9dec2.wav",
    hash: "sha256-a3f9dec24e06d6cab975f984714155268bc66f7d079f8f3b5069af18e693bc26"
  }
} as const);
