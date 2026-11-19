// Pip's Big Leap — the Idol wow pass (2026-11) mounts image-to-3D GLBs for Pip, Brambleback, villagers, pickups,
// checkpoints, spring drums, the Sun-Gate arch and the static diorama decor (`sharedAssets` in aura-assets.shared.ts,
// built by src/art/idolModels.ts). Island plinths, platforms, hazards and animated props stay procedural.
// Unmounted backdrop hash/bounds records below exist solely so certify.ts reports unmounted provenance.

export const assets = {
  backdrop: {
    verdant: {
      id: "showcaseKenneyVerdantPlatformerWorld",
      hash: "sha256-ac8f17eb8a42240a32ac642075de59345ead45e950d7f607aeba0afac4e958cd",
      bounds: [831.812, 20.246, 2.8] as const
    },
    cartoon: {
      id: "showcaseCartoonPlatformWorld",
      hash: "sha256-b8fc8e2586819a97a81839b07cce298986deb556da6842691bec14ee4dde9b7d",
      bounds: [18.49, 20.576, 4.81] as const
    },
    palace: {
      id: "showcasePlatformerWorldLevel",
      hash: "sha256-2fc1b7837a806baf57e497da880e1415908eaa85eee2795da0faf579fff1eeec",
      bounds: [72.346, 73.204, 12.129] as const
    },
    readable: {
      id: "showcaseReadablePlatformLevel",
      hash: "sha256-56edd8acc1a8c803bef3e5a13044a9ee4a903bafae4e80fc3a9e6e49697c0c68",
      bounds: [1330.839, 285.819, 370.509] as const
    },
    sidescroll: {
      id: "showcaseSideScrollerPlatformLevel",
      hash: "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4",
      bounds: [1428.155, 386.171, 735.373] as const
    },
    basicpack: {
      id: "showcasePlatformerBasicPack",
      hash: "sha256-f28b1b1568ec532ddb45f6dbfd9417a80df293253450b68b46b70fa09331660d",
      bounds: [6, 2.174, 7.026] as const
    }
  }
} as const;

/** Pip's clip per locomotion state: the in-place loops baked into the rigged Idol hero (`pipHero`: idle/walk/run/jump). */
export const PIP_CLIPS = {
  idle: "idle",
  walk: "walk",
  run: "run",
  jump: "jump",
  fall: "jump",
  crouch: "jump",
  die: "idle",
  hurt: "idle",
  celebrate: "jump",
  interact: "jump"
} as const;

/** Brambleback's clip per boss phase: the in-place loops baked into the rigged Idol boss (`pipBrambleback`). */
export const BOSS_CLIPS = {
  idle: "idle",
  walk: "run",
  attack: "jump",
  hurt: "idle",
  die: "idle",
  taunt: "walk"
} as const;
