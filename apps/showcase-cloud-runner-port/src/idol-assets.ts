/**
 * The Idol models the mounted example (examples/kid-goku-beyond-the-clouds-port/idol.ts) draws. Listed here, inside the
 * app's `src`, so `aura3d assets typegen --route apps/showcase-cloud-runner-port` emits exactly these into
 * ./aura-assets.route.ts and the route never bundles the repository-wide catalogue (src/aura-assets.ts).
 */
import { assets } from "./aura-assets.route";

export const CUMULUS_IDOL_ASSETS = {
  cdSkyKidHero: assets.cdSkyKidHero,
  cdCloudSteed: assets.cdCloudSteed,
  cdSkyWyvernBody: assets.cdSkyWyvernBody,
  cdSkyWyvernWingL: assets.cdSkyWyvernWingL,
  cdSkyWyvernWingR: assets.cdSkyWyvernWingR,
  cdStormTyrantRig: assets.cdStormTyrantRig,
  cdRideLog: assets.cdRideLog,
  cdHermitCottage: assets.cdHermitCottage,
  cdShrinePillar: assets.cdShrinePillar,
  cdBoulder: assets.cdBoulder,
  cdHoneyRoast: assets.cdHoneyRoast,
  cdCanopyTree: assets.cdCanopyTree,
  cdBonsaiPine: assets.cdBonsaiPine,
  cdShoulderRock: assets.cdShoulderRock
};
