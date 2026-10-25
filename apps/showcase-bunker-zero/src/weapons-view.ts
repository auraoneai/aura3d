import { WEAPONS, type WeaponId } from "./sim";

/** Catalog key of the first-person model drawn for each weapon. One entry per weapon, all distinct, so the HUD name and the model in hand cannot disagree. */
export const VIEWMODEL_ASSET = {
  knife: "mechWeaponA",
  pistol: "bzPistol",
  mg: "corridorPulseRifleMeshy",
  rocket: "mechWeaponB"
} as const satisfies Record<WeaponId, string>;

/** The HUD weapon name always comes from the active weapon definition. */
export function weaponHudLabel(id: WeaponId): string {
  return WEAPONS[id].name;
}

/** Yaw added to each viewmodel so every muzzle points away from the player. Meshy models do not agree on which end is the muzzle. */
export const VIEWMODEL_YAW_OFFSET: Record<WeaponId, number> = {
  knife: 0,
  pistol: Math.PI,
  mg: 0,
  rocket: 0
};
