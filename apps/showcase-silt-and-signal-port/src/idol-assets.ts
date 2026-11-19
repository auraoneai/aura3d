/**
 * Idol wow pass: Duneglide's Idol GLBs as literal references, so `aura3d assets typegen --route
 * apps/showcase-silt-and-signal-port` emits exactly these into src/aura-assets.route.ts and the route never loads the
 * repository-wide catalogue. examples/silt-and-signal-port/art/idolModels.ts mounts them.
 */
import { assets } from "./aura-assets.route";

export const DUNE_IDOL = {
  duneSkiffAlt: assets.duneSkiffAlt,
  duneRiderRig: assets.duneRiderRig,
  duneBuggy: assets.duneBuggy,
  duneTowShell: assets.duneTowShell,
  duneViaduct: assets.duneViaduct,
  duneGatehouse: assets.duneGatehouse,
  duneCanyonGate: assets.duneCanyonGate,
  duneRelayTower: assets.duneRelayTower,
  duneObelisk: assets.duneObelisk,
  duneMesa: assets.duneMesa,
  duneStall: assets.duneStall,
  duneSignalPylon: assets.duneSignalPylon,
  duneBannerMast: assets.duneBannerMast
} as const;
