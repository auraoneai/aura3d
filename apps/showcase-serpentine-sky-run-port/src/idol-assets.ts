/**
 * The Idol models the mounted example (examples/saiyan-snake-way-port) draws. Listed here, inside the app's `src`, so
 * `aura3d assets typegen --route apps/showcase-serpentine-sky-run-port` emits exactly these into ./aura-assets.route.ts and
 * the route never bundles the repository-wide catalogue (src/aura-assets.ts).
 */
import { assets } from "./aura-assets.route";

export const SERPENTINE_IDOL_ASSETS = {
  ssrHeroViolet: assets.ssrHeroViolet,
  ssrHeroTide: assets.ssrHeroTide,
  ssrHeroVerdant: assets.ssrHeroVerdant,
  ssrOni: assets.ssrOni,
  ssrSweeperBody: assets.ssrSweeperBody,
  ssrCartWheel: assets.ssrCartWheel,
  ssrBarrier: assets.ssrBarrier,
  ssrArch: assets.ssrArch,
  ssrFeast: assets.ssrFeast,
  ssrSerpentHead: assets.ssrSerpentHead,
  ssrGatehouse: assets.ssrGatehouse,
  ssrIslandPagoda: assets.ssrIslandPagoda,
  ssrIslandLantern: assets.ssrIslandLantern,
  ssrIslandShrine: assets.ssrIslandShrine,
  ssrTailMonument: assets.ssrTailMonument,
  ssrLantern: assets.ssrLantern,
  ssrTorii: assets.ssrTorii,
  ssrPlanetlet: assets.ssrPlanetlet
} as const;

export type SerpentineIdolKey = keyof typeof SERPENTINE_IDOL_ASSETS;
