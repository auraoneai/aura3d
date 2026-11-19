/**
 * Idol pass typed assets for Lamplight Line (`examples/last-train-port/idolModels.ts`). Each `assets.<key>` is listed here so
 * `aura3d assets typegen --route apps/showcase-last-train-port` emits a route-local module with only these entries
 * (the shared src/aura-assets.ts catalogue is megabytes of JS) and the route ships its own copies under public/aura-assets/.
 */
import { assets } from "./aura-assets.route";

export const IDOL_ASSETS = {
  llTram: assets.llTram,
  llMotorman: assets.llMotorman,
  llPaxEasy: assets.llPaxEasy,
  llPaxSightseer: assets.llPaxSightseer,
  llPaxRushed: assets.llPaxRushed,
  llPaxSleeper: assets.llPaxSleeper,
  llFolk0: assets.llFolk0,
  llFolk1: assets.llFolk1,
  llFolk2: assets.llFolk2,
  llFolk3: assets.llFolk3,
  llFolk4: assets.llFolk4,
  llFolk5: assets.llFolk5,
  llHouse0: assets.llHouse0,
  llHouse1: assets.llHouse1,
  llHouse2: assets.llHouse2,
  llHouseSnow0: assets.llHouseSnow0,
  llHouseSnow1: assets.llHouseSnow1,
  llHouseSnow2: assets.llHouseSnow2,
  llClockTower: assets.llClockTower,
  llClockTowerSnow: assets.llClockTowerSnow,
  llLighthouse: assets.llLighthouse,
  llKeep: assets.llKeep,
  llWatchtower: assets.llWatchtower,
  llCrates: assets.llCrates,
  // rigged sidewalk / town walkers (walk + idle clips)
  llWalkerA: assets.llWalkerA,
  llWalkerB: assets.llWalkerB,
  llWalkerC: assets.llWalkerC,
  llWalkerD: assets.llWalkerD
} as const;
