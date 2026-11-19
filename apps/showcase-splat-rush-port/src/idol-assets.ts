/**
 * Idol GLBs mounted by the Splat Rush port (`examples/splat-rush-port/idol.ts`), resolved from the route-scoped asset
 * module (`aura3d assets typegen --route apps/showcase-splat-rush-port`) so the bundle never pulls in the repo-wide catalogue.
 */
import { assets } from "./aura-assets.route";

export const SPLAT_IDOL_ASSETS = {
  splatRunnerRig: assets.splatRunnerRig,
  splatFinishArch: assets.splatFinishArch,
  splatSweeperBot: assets.splatSweeperBot,
  splatPickupRainbow: assets.splatPickupRainbow,
  splatPickupShield: assets.splatPickupShield,
  splatPickupDouble: assets.splatPickupDouble,
  splatPickupSwitch: assets.splatPickupSwitch,
  splatIslandTree: assets.splatIslandTree,
  splatIslandTower: assets.splatIslandTower,
  splatBalloon: assets.splatBalloon,
  splatIslandPaintPot: assets.splatIslandPaintPot,
  splatIslandPalette: assets.splatIslandPalette,
  splatIslandEasel: assets.splatIslandEasel
} as const;
