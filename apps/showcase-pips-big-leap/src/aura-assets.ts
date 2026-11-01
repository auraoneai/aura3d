// Pip's Big Leap — typed catalog refs (no raw URLs).
//
// Hero, boss, and the collectible/checkpoint/gate props are bespoke Meshy
// generations imported into this app's own catalog (`aura.assets.json`,
// generated key surface in `src/aura-catalog.ts`). GU47 phase 9 (PRD D2): every
// world prop and the sidekick NPC is now this game's own `pips*` key (CC0
// catalog files or the WP-36 Meshy moss disc, admitted into this app with
// licence and provenance). Only the generic conifer, boulders and helper still
// come from the shared repo catalog, through the small per-app copy in
// `src/aura-assets.shared.ts` (RH-06: importing the root `src/aura-assets.ts`
// shipped the whole 2.6 MB shared catalog to this page).
import { assets as catalog } from "./aura-catalog.js";
import { sharedAssets as shared } from "./aura-assets.shared.js";

export const assets = {
  pip: catalog.pipsPip,
  boss: catalog.pipsBrambleback,
  sunseed: catalog.pipsSunseed,
  goldenAcorn: catalog.pipsGoldenAcorn,
  checkpointFlag: catalog.pipsCheckpointFlag,
  sungate: catalog.pipsSungate,
  hawk: catalog.pipsBee,
  sidekick: catalog.pipsSidekick,
  helper: shared.helperChar,
  props: {
    conifer: shared.propConifer,
    boulder: shared.propBoulder,
    rockB: shared.propRockB,
    windmill: catalog.pipsWindmill,
    watchtower: catalog.pipsWatchtower,
    crate: catalog.pipsCrate,
    barrel: catalog.pipsBarrel,
    crystalShard: catalog.pipsCrystal,
    heart: catalog.pipsHeart,
    star: catalog.pipsStar,
    brazier: catalog.pipsEmberPot,
    streetLamp: catalog.pipsLantern,
    boostPad: catalog.pipsBouncer,
    arch: catalog.pipsArch,
    pedestal: catalog.pipsTileMossDisc,
    turbine: catalog.pipsWindTurbine,
    pylon: catalog.pipsPillar
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
