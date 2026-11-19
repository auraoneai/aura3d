/**
 * Idol wow pass: Ion Circuit's Idol GLBs as literal references, so `aura3d assets typegen --route apps/showcase-heatsink-port`
 * emits exactly these into src/aura-assets.route.ts and the route never loads the repository-wide catalogue.
 * examples/heatsink-port/art/idolModels.ts mounts them.
 */
import { assets } from "./aura-assets.route";

export const ION_IDOL = {
  ioncDrone: assets.ioncDrone,
  ioncSentry: assets.ioncSentry,
  ioncHeavy: assets.ioncHeavy,
  ioncGatePylon: assets.ioncGatePylon,
  ioncMesa: assets.ioncMesa,
  ioncCryoVent: assets.ioncCryoVent,
  ioncCoolantTower: assets.ioncCoolantTower,
  ioncBoostArch: assets.ioncBoostArch,
  ioncBarrel: assets.ioncBarrel,
  ioncPickupShield: assets.ioncPickupShield,
  ioncPickupRepair: assets.ioncPickupRepair
} as const;
