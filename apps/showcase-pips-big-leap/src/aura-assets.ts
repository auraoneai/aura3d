// Pip's Big Leap — typed catalog refs (no raw URLs).
//
// Hero, boss, and the collectible/checkpoint/gate props are bespoke Meshy
// generations imported into this app's own catalog (`aura.assets.json`,
// generated key surface in `src/aura-catalog.ts`). The `backdrop` world kits
// and the two NPC runners still come from the shared repo-level catalog —
// they are environment dressing/cameo kits, not the replaced hero props.
import { assets as catalog } from "./aura-catalog.js";
import { assets as shared } from "../../../src/aura-assets";

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
  robot: shared.showcaseRunnerRobot,
  backdrop: {
    verdant: shared.showcaseKenneyVerdantPlatformerWorld,
    cartoon: shared.showcaseCartoonPlatformWorld,
    palace: shared.showcasePlatformerWorldLevel,
    readable: shared.showcaseReadablePlatformLevel,
    sidescroll: shared.showcaseSideScrollerPlatformLevel,
    basicpack: shared.showcasePlatformerBasicPack
  },
  props: {
    pineTree: shared.propPineTree,
    conifer: shared.propConifer,
    boulder: shared.propBoulder,
    rockA: shared.propRockA,
    rockB: shared.propRockB,
    windmill: shared.gullsiegeWindmillMeshy,
    watchtower: shared.gullsiegeWatchtowerMeshy,
    gatehouse: shared.gullsiegeGatehouseMeshy,
    bridge: shared.gullsiegeBridgeMeshy,
    planks: shared.gullsiegePlanksMeshy,
    crate: shared.gullsiegeCrateMeshy,
    barrel: shared.gullsiegeBarrelMeshy,
    crystalShard: shared.skylineCrystalShardMeshy,
    energyCore: shared.fpsEnergyCorePickupMeshy,
    treasure: shared.bunkerTreasureMeshy,
    brazier: shared.auraClashCornerBrazierPylonMeshy,
    streetLamp: shared.neonStreetLampProp,
    boostPad: shared.heatsinkBoostPad,
    arch: shared.heatsinkArch,
    pedestal: shared.galleryShiftPedestal,
    turbine: shared.reactorFusionTurbineMeshy,
    pylon: shared.blockfallReactorContainmentPylonMeshy,
    dragonStatue: shared.clashDragonStatueMeshy,
    teaHouse: shared.showcaseTeaHouse,
    hound: shared.bunkerHoundMeshy,
    moth: shared.neonCrownMothElite,
    frostDrone: shared.skylineFrostSentryDroneMeshy,
    hawk: shared.heatsinkDroneNighthawk
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
