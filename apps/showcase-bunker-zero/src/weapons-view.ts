import { WEAPONS, type WeaponId } from "./sim";

/** Catalog key of the first-person model drawn for each weapon. One entry per weapon, all distinct, so the HUD name and the model in hand cannot disagree. */
export const VIEWMODEL_ASSET = {
  // GU47 phase 9 (D2): the game's own machete (Poly Haven machete, CC0) replaces the borrowed mech knife
  knife: "bzMachete",
  pistol: "bzPistol",
  // GU47 phase 6: the rifle GLB without its self-glow (aura-evidence/lift/bzMgViewmodel.lift.json); the pickup keeps the original
  mg: "bzMgViewmodel",
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
  // GU47 phase 6: the rifle's muzzle is at +X too (first drawn in hand in vmprobe g11p6-r3, it pointed at the camera)
  mg: Math.PI,
  rocket: 0
};
