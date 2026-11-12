// Pip's Big Leap — zero mounted GLB models (Pip, Brambleback, villagers, island plinths,
// pickups, checkpoints, springs, Sun-Gate and woodland props are 100% @aura3d/engine procedural).
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

/** Procedural locomotion state labels for Pip (`buildPipHeroNode`). */
export const PIP_CLIPS = {
  idle: "Idle",
  walk: "Quick_Walk",
  run: "RunFast",
  jump: "Regular_Jump",
  fall: "Regular_Jump",
  crouch: "Regular_Jump",
  die: "Dead",
  hurt: "Idle",
  celebrate: "Victory_Cheer",
  interact: "happy_jump_m"
} as const;

/** Procedural phase labels for Brambleback (`buildBramblebackBossNode`). */
export const BOSS_CLIPS = {
  idle: "Idle",
  walk: "Quick_Walk",
  attack: "Attack",
  hurt: "Hit_Reaction",
  die: "Dead",
  taunt: "Chest_Pound_Taunt"
} as const;
