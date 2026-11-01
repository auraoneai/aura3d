// Pip's Big Leap — typed catalog refs (no raw URLs).
//
// Hero, boss, and the collectible/checkpoint/gate props are bespoke Meshy
// generations imported into this app's own catalog (`aura.assets.json`,
// generated key surface in `src/aura-catalog.ts`). The world props and the
// two NPC runners come from the shared repo catalog, through the small
// per-app copy in `src/aura-assets.shared.ts` (RH-06: importing the root
// `src/aura-assets.ts` shipped the whole 2.6 MB shared catalog to this page).
import { assets as catalog } from "./aura-catalog.js";
import { sharedAssets as shared } from "./aura-assets.shared.js";

export const assets = {
  pip: catalog.pipsPip,
  boss: catalog.pipsBrambleback,
  sunseed: catalog.pipsSunseed,
  goldenAcorn: catalog.pipsGoldenAcorn,
  checkpointFlag: catalog.pipsCheckpointFlag,
  sungate: catalog.pipsSungate,
  hawk: shared.heatsinkDroneNighthawk,
  sidekick: shared.showcaseSidekickRunner,
  helper: shared.helperChar,
  // Backdrop kits are not mounted; certify.ts reads their hash only.
  backdrop: {
    verdant: shared.showcaseKenneyVerdantPlatformerWorld,
    cartoon: shared.showcaseCartoonPlatformWorld,
    palace: shared.showcasePlatformerWorldLevel,
    readable: shared.showcaseReadablePlatformLevel,
    sidescroll: shared.showcaseSideScrollerPlatformLevel,
    basicpack: shared.showcasePlatformerBasicPack
  },
  props: {
    conifer: shared.propConifer,
    boulder: shared.propBoulder,
    rockB: shared.propRockB,
    windmill: shared.gullsiegeWindmillMeshy,
    watchtower: shared.gullsiegeWatchtowerMeshy,
    crate: shared.gullsiegeCrateMeshy,
    barrel: shared.gullsiegeBarrelMeshy,
    crystalShard: shared.skylineCrystalShardMeshy,
    energyCore: shared.fpsEnergyCorePickupMeshy,
    brazier: shared.auraClashCornerBrazierPylonMeshy,
    streetLamp: shared.neonStreetLampProp,
    boostPad: shared.heatsinkBoostPad,
    arch: shared.heatsinkArch,
    pedestal: shared.galleryShiftPedestal,
    turbine: shared.reactorFusionTurbineMeshy,
    pylon: shared.blockfallReactorContainmentPylonMeshy
  }
} as const;

/**
 * Pip's clip names on the bespoke Meshy rig (`pipsPip` animated.glb).
 * Available clips: Idle, RunFast, Regular_Jump, happy_jump_m, Dead,
 * Victory_Cheer, Quick_Walk — states with no dedicated clip reuse the
 * nearest match (fall/crouch hold the jump pose; hurt uses the idle stand-in).
 */
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

/** Brambleback's clip names on the bespoke Meshy rig (`pipsBrambleback`). */
export const BOSS_CLIPS = {
  idle: "Idle",
  walk: "Quick_Walk",
  attack: "Attack",
  hurt: "Hit_Reaction",
  die: "Dead",
  taunt: "Chest_Pound_Taunt"
} as const;
