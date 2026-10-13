import { defineAuraAssets } from "@aura3d/engine";

// Fresh coherent typed set for the single-path rebuild: one hero van, the
// visible parcel, two traffic bodies, and the two dock props, plus the
// route's synthesized WAV cues. Every entry mirrors an asset already
// admitted in the repo-root aura.assets.json (same id, url, and sha256),
// served from the shared public/aura-assets tree this app's vite publicDir
// already points at — no new admission is claimed here. Traffic uses the
// metre-scale Kenney/CC-BY bodies, not the retired centimetre-bounds
// sedan/hatch GLBs, so no fit-magic normalization is needed at runtime.
export const assets = defineAuraAssets({
  courierVanMeshyV2Decimated: {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierVanMeshyV2Decimated.6f509ab0.glb",
    bounds: [1.904, 0.941, 0.998],
    hash: "sha256-6f509ab0902bbf048f828938332c4172b1dac0aef67f375e3fc666e88e0ba983",
    metadata: { materials: ["material"], animations: [], textures: [], license: "Meshy paid private generation terms", attribution: "Meshy" }
  },
  courierParcel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierParcel.b04bff68.glb",
    bounds: [0.774, 0.64, 0.393],
    hash: "sha256-b04bff687523a449ea633259c8203c727878a5fcb8e18f29e2719b63f56bc4f4",
    metadata: { materials: ["defaultMat"], animations: [], textures: [], license: "CC-BY-4.0", attribution: "macriciox" }
  },
  deliveryCar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/deliveryCar.426a3e3a.glb",
    bounds: [1.5, 1.65, 3.25],
    hash: "sha256-426a3e3a2c242c05c889b1445ba02ef95b2c8b7cd6f597e1275ef736a826014b",
    metadata: { materials: ["colormap"], animations: [], textures: [], license: "CC0-1.0", attribution: "Kenney" }
  },
  showcaseCityVehicle: {
    type: "model",
    format: "glb",
    url: "/aura-assets/showcaseCityVehicle.15552b57.glb",
    bounds: [2.376, 1.508, 5],
    hash: "sha256-15552b57377570b1c9d9fe8fa9476856a6ee357e4c7d8be1c6dd191e1ef7d27e",
    metadata: { materials: ["material"], animations: [], textures: [], license: "CC-BY-4.0", attribution: "Lee Alex Johansson" }
  },
  courierZoneBollard: {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierZoneBollard.a696b2f7.glb",
    bounds: [4.261, 2.551, 2.55],
    hash: "sha256-a696b2f70a052d887b4560138a6f6d80258d8c5cdfa520a6abccb4a5b0d6e412",
    metadata: { materials: ["lambert1"], animations: [], textures: [], license: "CC-BY-4.0", attribution: "chriskujath2" }
  },
  courierZoneAwning: {
    type: "model",
    format: "glb",
    url: "/aura-assets/courierZoneAwning.97e71538.glb",
    bounds: [4.008, 0.41, 1.218],
    hash: "sha256-97e715389628c95fcb33ae6d4776481a3efc46072723b6bc1e04dd5dc87141bf",
    metadata: { materials: ["awinig_metal"], animations: [], textures: [], license: "CC-BY-4.0", attribution: "Pixel_Monster" }
  },
  courierEngineSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierEngineSfx.0cc87f79.wav",
    hash: "sha256-0cc87f79f6f680bcae5f289ddc94d639a84a62626880cfcdc0c4125b18bf8fa7"
  },
  courierAmbientCitySfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierAmbientCitySfx.995b1230.wav",
    hash: "sha256-995b1230697415d1aa56abf95135d10f27d9b778709bed34caa78f36205bb024"
  },
  courierDispatchBlipSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierDispatchBlipSfx.8f47ba51.wav",
    hash: "sha256-8f47ba514fcbac57761264a77c2a617d4a0fafaf51afde40fe3d40ebef97c09e"
  },
  courierParcelPickupSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierParcelPickupSfx.86c6b345.wav",
    hash: "sha256-86c6b345a32b73c02f9b9304434baab1e465b75d6e2d217dd29eb8795feef740"
  },
  courierParcelDropSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierParcelDropSfx.69469dfa.wav",
    hash: "sha256-69469dfaf7854a98c382abd52f7f199a4e781cb5a44ca8fe7ff7f4da768af02f"
  },
  courierEarlyBonusSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierEarlyBonusSfx.bd2aa402.wav",
    hash: "sha256-bd2aa40241b19813225b02aa787ce5ed717ac0217ed0a83f6cdee3349e7706e6"
  },
  courierStrikeHitSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierStrikeHitSfx.c75e32f0.wav",
    hash: "sha256-c75e32f00e819d03e3c251128a6e8e8e3492db6f12e7f453c8a4be182fd4a"
  },
  courierHornNearSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierHornNearSfx.8271dced.wav",
    hash: "sha256-8271dceda2c48f819789d53a1c83da4ff59382d67baf018397672b9c9b11f4bc"
  },
  courierShiftClearSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierShiftClearSfx.d6d76276.wav",
    hash: "sha256-d6d76276eefcda93c2fe15852f5722f1b5e82223061c19cce0f1c306d46128dc"
  },
  courierShiftFailSfx: {
    type: "audio",
    format: "wav",
    url: "/aura-assets/courierShiftFailSfx.b9378836.wav",
    hash: "sha256-b93788363910dd46585c68280e825e0e78fb0a0ed8723c3f861878ca9827ce1b"
  }
} as const);
