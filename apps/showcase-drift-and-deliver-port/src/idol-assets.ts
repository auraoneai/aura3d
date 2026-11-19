/**
 * Idol pass typed assets for Gridlock Courier (`examples/drift-and-deliver-port/idol.ts`). Each `assets.<key>` is listed here so
 * `aura3d assets typegen --route apps/showcase-drift-and-deliver-port` emits a route-local module with only these entries
 * (the shared src/aura-assets.ts catalogue is 2.6 MB of JS).
 */
import { assets } from "./aura-assets.route";

export const IDOL_ASSETS = {
  gcCourier: assets.gcCourier,
  gcSedanCoral: assets.gcSedanCoral,
  gcSedanBlue: assets.gcSedanBlue,
  gcHatchMint: assets.gcHatchMint,
  gcHatchOrange: assets.gcHatchOrange,
  gcVanCream: assets.gcVanCream,
  gcVanTerracotta: assets.gcVanTerracotta,
  gcTruckWhite: assets.gcTruckWhite,
  gcTruckBlue: assets.gcTruckBlue,
  gcTaxi: assets.gcTaxi,
  gcBusCream: assets.gcBusCream,
  gcBusCoral: assets.gcBusCoral,
  gcCruiser: assets.gcCruiser,
  gcPedA: assets.gcPedA,
  gcPedB: assets.gcPedB,
  gcPedC: assets.gcPedC,
  gcPedD: assets.gcPedD,
  gcPedE: assets.gcPedE,
  gcPedF: assets.gcPedF,
  gcClocktower: assets.gcClocktower,
  gcLighthouse: assets.gcLighthouse,
  gcTree: assets.gcTree,
  gcPalm: assets.gcPalm,
  gcHydrant: assets.gcHydrant,
  gcWatertank: assets.gcWatertank,
  gcScooter: assets.gcScooter,
  // rigged sidewalk / town walkers (walk + idle clips)
  gcWalkerA: assets.gcWalkerA,
  gcWalkerB: assets.gcWalkerB,
  gcWalkerC: assets.gcWalkerC,
  gcWalkerD: assets.gcWalkerD
} as const;
