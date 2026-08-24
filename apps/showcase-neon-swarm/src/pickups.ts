/**
 * Neon Swarm intermission pickup doors.
 *
 * After a wave clears, three doors open for the intermission: fire-rate,
 * dash-cooldown, or shield. The player walks into a door sensor to choose;
 * effects apply to the player upgrade struct. Pure module.
 */

export type PickupKind = "fire-rate" | "dash-cooldown" | "shield";

export interface PickupDoor {
  readonly kind: PickupKind;
  /** Street position of the door sensor volume. */
  readonly x: number;
  readonly z: number;
  readonly label: string;
  readonly detail: string;
}

export const PICKUP_DOORS: readonly PickupDoor[] = [
  { kind: "fire-rate", x: -8, z: 0, label: "Overclock Coils", detail: "Pulse fire rate +35%" },
  { kind: "dash-cooldown", x: 0, z: 0, label: "Kinetic Capacitor", detail: "Dash cooldown -30%" },
  { kind: "shield", x: 8, z: 0, label: "Aegis Cell", detail: "+1 shield charge" }
];

export interface RiskPickup {
  readonly x: number;
  readonly z: number;
}

/**
 * One authored gold charge pickup per wave. The fixed positions keep seeded
 * runs and exact screenshots reproducible while forcing the player to leave
 * the safest opening line. Every position remains inside the wave-five
 * compressed arena.
 */
export const RISK_PICKUPS: readonly RiskPickup[] = [
  { x: -9, z: 5 },
  { x: 6, z: -2 },
  { x: -4, z: 4 },
  { x: 4, z: -3 },
  { x: -9, z: 5 }
];

export function riskPickupForWave(wave: number): RiskPickup {
  const index = Math.max(0, Math.min(RISK_PICKUPS.length - 1, Math.floor(wave) - 1));
  return RISK_PICKUPS[index]!;
}

export function senseRiskPickup(
  player: { readonly x: number; readonly z: number },
  pickup: RiskPickup,
  radius = 1.2
): boolean {
  const dx = player.x - pickup.x;
  const dz = player.z - pickup.z;
  return dx * dx + dz * dz <= radius * radius;
}

export interface PickupSensorResult {
  readonly door: PickupDoor | null;
}

/**
 * Sensor overlap test. The courier radius matches the player module so the
 * walk-in feel matches the visual avatar size.
 */
export function sensePickupDoors(
  player: { readonly x: number; readonly z: number },
  doors: readonly PickupDoor[] = PICKUP_DOORS
): PickupSensorResult {
  const radius = 1.15;
  for (const door of doors) {
    const dx = player.x - door.x;
    const dz = player.z - door.z;
    if (dx * dx + dz * dz <= radius * radius) return { door };
  }
  return { door: null };
}
