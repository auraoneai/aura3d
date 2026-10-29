/**
 * Which simulation entities the renderer draws each frame, and in which pool. Pure (no engine imports) so the unit test can
 * replay the simulation and prove that everything near the player has a drawn slot of its own type (audit RR-1, RR-2, RR-4).
 *
 * Rules:
 * - Only entities inside the draw window [pz - ahead, pz + behind] are considered (the chase camera sits 6.2 m behind the car,
 *   so nothing more than 8 m behind the player is on screen).
 * - Inside the window, entities are taken in order of distance ahead (behind ones first, then the nearest ahead), so when a
 *   pool overflows it is the farthest entity that is left out, never one at the player.
 * - Every vehicle type has its own pool. A heavy vehicle is never drawn with a car model.
 * - Pool sizes are the measured peaks of the seeded 90 s replays in tests/unit/roadster-rush-native/render-pools.test.ts plus
 *   a margin.
 */

export const VEHICLE_TYPES = ["sedan", "hatch", "suv", "taxi", "van", "pickup", "boxtruck", "bus", "carrier"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const POWERUP_KINDS = ["air", "rocket", "shield", "magnet", "multiplier"] as const;
export type PowerupKind = (typeof POWERUP_KINDS)[number];

/** Draw windows in metres ahead of / behind the player (z decreases ahead). */
export const DRAW_WINDOW = {
  vehicles: { ahead: 235, behind: 8 },
  skyCars: { ahead: 290, behind: 8 },
  pickups: { ahead: 235, behind: 8 }
} as const;

/**
 * Drawn-slot capacity per pool: the measured peaks of the three seeded 90 s replays (render-pools.test.ts prints them as
 * RR_POOL_PEAKS) plus about 25%.
 */
export const POOL_CAPACITY: Readonly<Record<VehicleType, number>> & { readonly skyCar: number; readonly bolt: number; readonly powerup: Readonly<Record<PowerupKind, number>> } = {
  sedan: 28,
  hatch: 20,
  suv: 20,
  taxi: 14,
  van: 11,
  pickup: 14,
  boxtruck: 29,
  bus: 15,
  carrier: 12,
  skyCar: 26,
  bolt: 172,
  powerup: { air: 10, rocket: 4, shield: 4, magnet: 4, multiplier: 4 }
};

/**
 * Vehicles up to this far ahead are drawn by shadow-casting pools; farther ones by pools that cast no shadow. The authored
 * shadow reaches 90 m, so a shadow from farther traffic would never be sampled, and splitting keeps the depth passes from
 * drawing the whole 235 m window.
 */
export const SHADOW_NEAR = 90;

/** Capacity of the shadow-casting (near) part of each vehicle pool: measured near peaks plus about 25%. */
export const NEAR_CAPACITY: Readonly<Record<VehicleType, number>> = {
  sedan: 14,
  hatch: 12,
  suv: 10,
  taxi: 8,
  van: 8,
  pickup: 9,
  boxtruck: 19,
  bus: 9,
  carrier: 7
};

/**
 * Split one type's nearest-first list into the near (shadowed) and far parts, writing into `near` and `far`. A near vehicle
 * that does not fit the near pool is drawn by the far pool (no shadow) rather than dropped; the far pool holds the full
 * POOL_CAPACITY.
 */
export function splitNearFar<T extends HasZ>(list: readonly T[], pz: number, nearCapacity: number, near: T[], far: T[]): void {
  near.length = 0;
  far.length = 0;
  for (const item of list) {
    if (pz - item.z <= SHADOW_NEAR && near.length < nearCapacity) near.push(item);
    else far.push(item);
  }
}

interface HasZ {
  readonly z: number;
}

/** Keep the entities of `items` inside the window, nearest-ahead order, at most `capacity`. Writes into and returns `out`. */
export function nearestAhead<T extends HasZ>(items: readonly T[], pz: number, window: { readonly ahead: number; readonly behind: number }, capacity: number, out: T[] = []): T[] {
  out.length = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const ahead = pz - item.z;
    if (ahead > window.ahead || ahead < -window.behind) continue;
    out.push(item);
  }
  if (out.length > 1) out.sort((a, b) => b.z - a.z);
  if (out.length > capacity) out.length = capacity;
  return out;
}

export interface GroundVehicleLike extends HasZ {
  readonly type: string;
}

export type GroundSlots<V> = Record<VehicleType, V[]>;

export function emptyGroundSlots<V>(): GroundSlots<V> {
  return { sedan: [], hatch: [], suv: [], taxi: [], van: [], pickup: [], boxtruck: [], bus: [], carrier: [] };
}

const isVehicleType = (t: string): t is VehicleType => (VEHICLE_TYPES as readonly string[]).includes(t);

/** Ground traffic per type pool. Unknown types draw as sedans (the simulation emits none today). */
export function assignGroundSlots<V extends GroundVehicleLike>(vehicles: readonly V[], pz: number, out: GroundSlots<V> = emptyGroundSlots<V>(), capacity: Readonly<Record<VehicleType, number>> = POOL_CAPACITY): GroundSlots<V> {
  for (const t of VEHICLE_TYPES) out[t].length = 0;
  const { ahead, behind } = DRAW_WINDOW.vehicles;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (!v) continue;
    const d = pz - v.z;
    if (d > ahead || d < -behind) continue;
    out[isVehicleType(v.type) ? v.type : "sedan"].push(v);
  }
  for (const t of VEHICLE_TYPES) {
    const list = out[t];
    if (list.length > 1) list.sort((a, b) => b.z - a.z);
    if (list.length > capacity[t]) list.length = capacity[t];
  }
  return out;
}

export interface PickupLike extends HasZ {
  readonly kind: string;
}

export interface PickupSlots<P> {
  bolts: P[];
  powerups: Record<PowerupKind, P[]>;
}

export function emptyPickupSlots<P>(): PickupSlots<P> {
  return { bolts: [], powerups: { air: [], rocket: [], shield: [], magnet: [], multiplier: [] } };
}

const isPowerupKind = (k: string): k is PowerupKind => (POWERUP_KINDS as readonly string[]).includes(k);

/** Bolts and power-up orbs, nearest ahead first, each kind in its own pool. */
export function assignPickupSlots<P extends PickupLike>(pickups: readonly P[], pz: number, out: PickupSlots<P> = emptyPickupSlots<P>(), capacity = POOL_CAPACITY): PickupSlots<P> {
  out.bolts.length = 0;
  for (const k of POWERUP_KINDS) out.powerups[k].length = 0;
  const { ahead, behind } = DRAW_WINDOW.pickups;
  for (let i = 0; i < pickups.length; i++) {
    const pk = pickups[i];
    if (!pk) continue;
    const d = pz - pk.z;
    if (d > ahead || d < -behind) continue;
    if (pk.kind === "bolt" || !pk.kind) out.bolts.push(pk);
    else out.powerups[isPowerupKind(pk.kind) ? pk.kind : "air"].push(pk);
  }
  const trim = (list: P[], cap: number): void => {
    if (list.length > 1) list.sort((a, b) => b.z - a.z);
    if (list.length > cap) list.length = cap;
  };
  trim(out.bolts, capacity.bolt);
  for (const k of POWERUP_KINDS) trim(out.powerups[k], capacity.powerup[k]);
  return out;
}
