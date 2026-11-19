/**
 * Idol GLBs mounted by Craterline GP (`examples/strange-orbit-port/art/idolModels.ts`), resolved from the route-scoped
 * asset module (`aura3d assets typegen --route apps/showcase-strange-orbit-port`) so the bundle never pulls in the
 * repo-wide catalogue.
 */
import { assets } from "./aura-assets.route";

export const CRATERLINE_IDOL_ASSETS = {
  cgBikeAlabasterNR: assets.cgBikeAlabasterNR,
  cgBikeCobaltNR: assets.cgBikeCobaltNR,
  cgBikeCrimsonNR: assets.cgBikeCrimsonNR,
  cgBikeVioletNR: assets.cgBikeVioletNR,
  cgBikeTealNR: assets.cgBikeTealNR,
  cgBikeSandNR2: assets.cgBikeSandNR2,
  cgRiderCream: assets.cgRiderCream,
  cgRiderCobalt: assets.cgRiderCobalt,
  cgRiderCrimson2: assets.cgRiderCrimson2,
  cgBikeWheel: assets.cgBikeWheel,
  cgLander: assets.cgLander,
  cgObservatory: assets.cgObservatory,
  cgHabitat: assets.cgHabitat,
  cgDish: assets.cgDish,
  cgSolarArray: assets.cgSolarArray,
  cgTrailer: assets.cgTrailer,
  cgFuelTank: assets.cgFuelTank,
  cgGantry: assets.cgGantry
} as const;
