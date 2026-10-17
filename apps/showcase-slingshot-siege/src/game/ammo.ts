/**
 * Slingshot Siege — ammo roster + mid-air power semantics.
 *
 * Every shot loads one ammo type; tapping mid-flight fires the ability once.
 * The sim reads these definitions for mass/radius/behaviour — HUD reads them
 * for the dock chips and the ability hint.
 */
export type AmmoId = "pebble" | "stone" | "triple" | "squid" | "ember";

export interface AmmoDef {
  readonly id: AmmoId;
  readonly name: string;
  readonly short: string;
  /** HUD chip + projectile body colour. */
  readonly color: string;
  readonly glow: string;
  /** Physics. */
  readonly radius: number;
  readonly mass: number;
  readonly restitution: number;
  /** Base score multiplier applied to destruction this shot causes. */
  readonly damageScale: number;
  /** Remaining-ammo bonus each unused shot of this type banks. */
  readonly spareBonus: number;
  readonly abilityName: string;
  readonly abilityHint: string;
}

export const AMMO: Readonly<Record<AmmoId, AmmoDef>> = {
  pebble: {
    id: "pebble",
    name: "Egg-Bomb",
    short: "EGG",
    color: "#fff3d6",
    glow: "#ffd766",
    radius: 0.26,
    mass: 0.9,
    restitution: 0.35,
    damageScale: 1.0,
    spareBonus: 800,
    abilityName: "Yolk Drop",
    abilityHint: "Tap mid-air to drop an egg-bomb straight down"
  },
  stone: {
    id: "stone",
    name: "Stone",
    short: "STN",
    color: "#9aa6ba",
    glow: "#cfd9ea",
    radius: 0.3,
    mass: 3.4,
    restitution: 0.12,
    damageScale: 1.6,
    spareBonus: 1100,
    abilityName: "Slate Slam",
    abilityHint: "Tap mid-air for a crushing downward smash"
  },
  triple: {
    id: "triple",
    name: "Triple-Chick",
    short: "TRI",
    color: "#ffd94d",
    glow: "#fff0a0",
    radius: 0.2,
    mass: 0.55,
    restitution: 0.42,
    damageScale: 0.7,
    spareBonus: 900,
    abilityName: "Tri-Split",
    abilityHint: "Tap mid-air to split into three chicks"
  },
  squid: {
    id: "squid",
    name: "Anchor Squid",
    short: "SQD",
    color: "#7cd4b0",
    glow: "#b0f0d4",
    radius: 0.27,
    mass: 1.4,
    restitution: 0.2,
    damageScale: 1.15,
    spareBonus: 1200,
    abilityName: "Pierce & Yank",
    abilityHint: "Tap mid-air: pierce through, then yank the pile toward you"
  },
  ember: {
    id: "ember",
    name: "Fire-Egg",
    short: "FIR",
    color: "#ff8c4a",
    glow: "#ffc46e",
    radius: 0.27,
    mass: 1.1,
    restitution: 0.18,
    damageScale: 1.25,
    spareBonus: 1300,
    abilityName: "Flare Burst",
    abilityHint: "Tap mid-air for a splash-burn blast"
  }
};

export const AMMO_ORDER: readonly AmmoId[] = ["pebble", "stone", "triple", "squid", "ember"];

export function ammoForSlot(index: number, loadout: readonly AmmoId[]): AmmoId {
  return loadout[index] ?? "pebble";
}
