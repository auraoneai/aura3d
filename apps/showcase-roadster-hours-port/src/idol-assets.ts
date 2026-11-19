/**
 * The Idol GLBs Saltwind Highway draws (examples/roadster-hours-port/art/idol.ts), from the route-scoped catalogue: after
 * admitting a key, list it here and run `node packages/aura3d-cli/dist/cli.js assets typegen --route apps/showcase-roadster-hours-port`.
 */
import { assets } from "./aura-assets.route";

const { swRoadsterBodyB, swLighthouseB, swViaduct, swDinerB, swVilla, swVillaOchre, swTownhouse, swTownhouseSand, swSedanBlueP, swSedanSandP, swSedanClayP, swHatchMustardP, swHatchSeaGlassP, swSuvSlateP, swPickupRustP, swBusShuttleP, swSemiRedNW, swTractorTealP, swDriver } = assets;

export const SALTWIND_IDOL_ASSETS = { swRoadsterBodyB, swLighthouseB, swViaduct, swDinerB, swVilla, swVillaOchre, swTownhouse, swTownhouseSand, swSedanBlueP, swSedanSandP, swSedanClayP, swHatchMustardP, swHatchSeaGlassP, swSuvSlateP, swPickupRustP, swBusShuttleP, swSemiRedNW, swTractorTealP, swDriver } as const;
