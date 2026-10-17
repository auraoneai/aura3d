// Pip's Big Leap — typed catalog refs (no raw URLs).
import { assets as catalog } from "../../../src/aura-assets";

export const assets = {
  pip: catalog.showcaseKenneyOobiPlatformerHero,
  sidekick: catalog.showcaseSidekickRunner,
  helper: catalog.helperChar,
  robot: catalog.showcaseRunnerRobot,
  backdrop: {
    verdant: catalog.showcaseKenneyVerdantPlatformerWorld,
    cartoon: catalog.showcaseCartoonPlatformWorld,
    palace: catalog.showcasePlatformerWorldLevel,
    readable: catalog.showcaseReadablePlatformLevel,
    sidescroll: catalog.showcaseSideScrollerPlatformLevel,
    basicpack: catalog.showcasePlatformerBasicPack
  }
} as const;

/** Pip's certified clip names (Kenney Oobi platformer rig). */
export const PIP_CLIPS = {
  idle: "idle",
  walk: "walk",
  run: "sprint",
  jump: "jump",
  fall: "fall",
  crouch: "crouch",
  die: "die",
  hurt: "emote-no",
  celebrate: "emote-yes",
  interact: "interact-left"
} as const;
