/** Tuning constants of the Apex Overdrive freeway simulation (metres, seconds). */
export const LANE_WIDTH = 3.6;
export const LANE_COUNT = 5;
export const ROAD_HALF_WIDTH = 10.6;
export const laneX = (lane: number): number => (lane - 2) * LANE_WIDTH;
/** Player collision box (width, height, length). */
export const PLAYER_BOX = Object.freeze({ w: 1.9, h: 1.15, l: 4.3 });
export const FIXED_DT = 1 / 60;

export type VehicleType = "sedan" | "hatch" | "suv" | "taxi" | "van" | "pickup" | "boxtruck" | "bus" | "carrier";
export type PickupKind = "bolt" | "air" | "magnet" | "rocket" | "shield" | "multiplier";

export const CAR_TYPES: readonly VehicleType[] = ["sedan", "hatch", "suv", "taxi", "van", "pickup"];
export const CAR_WEIGHTS: readonly number[] = [0.3, 0.2, 0.18, 0.1, 0.1, 0.12];
export const ALL_VEHICLE_TYPES: readonly VehicleType[] = [...CAR_TYPES, "boxtruck", "bus", "carrier"];
export const HEAVY_TYPES: readonly VehicleType[] = ["boxtruck", "bus", "carrier"];

export interface VehicleSpec {
  w: number;
  h: number;
  l: number;
  ramp?: { length: number; height: number };
}
export const VEHICLE_SPECS: Readonly<Record<VehicleType, VehicleSpec>> = {
  sedan: { w: 1.9, h: 1.45, l: 4.6 },
  hatch: { w: 1.8, h: 1.5, l: 4 },
  suv: { w: 2, h: 1.85, l: 4.8 },
  taxi: { w: 1.9, h: 1.5, l: 4.6 },
  van: { w: 2, h: 2.3, l: 5.2 },
  pickup: { w: 2, h: 1.9, l: 5.4 },
  boxtruck: { w: 2.4, h: 3.4, l: 8 },
  bus: { w: 2.5, h: 3.2, l: 12 },
  carrier: { w: 2.5, h: 3.6, l: 16, ramp: { length: 5, height: 3.6 } }
};
/** Sky-lane roadster collision dimensions. */
export const SKY_SPEC = Object.freeze({ w: 2, h: 1.15, l: 4.3 });
export const SKY_PAINT_COUNT = 4;

export const PICKUP_VALUES: Readonly<Record<PickupKind, number>> = { bolt: 1, air: 35, magnet: 1, rocket: 1, shield: 1, multiplier: 2 };
export const POWERUP_KINDS: readonly PickupKind[] = ["magnet", "shield", "multiplier", "rocket"];
export const POWERUP_WEIGHTS: readonly number[] = [0.3, 0.25, 0.25, 0.2];
export const POWERUP_SECONDS = { magnet: 10, shield: 8, multiplier: 12 } as const;

// Player flight model.
export const BASE_SPEED_START = 26;
export const BASE_SPEED_MAX = 64;
export const BASE_SPEED_ACCEL = 0.16;
export const LANE_SPRING = 26;
export const LANE_SPRING_ROLLING = 17;
export const HOP_VELOCITY = 12;
export const HOP_AIR_COST = 6;
export const TAKEOFF_VELOCITY = 9;
export const THRUST_ACCEL = 62;
export const THRUST_AIR_DRAIN = 20;
export const GROUND_HOLD_TIME = 0.12;
export const FALL_TERMINAL = -16;
export const DIVE_TERMINAL = -26;
export const DIVE_ACCEL = 90;
export const SOFT_GRAVITY_FACTOR = 0.72;
export const AIR_REGEN = 7;
export const BOOST_SPEED_MULT = 1.35;
export const BOOST_AIR_DRAIN = 26;
/** Boost must have been off this long before its sound and shake fire again (presentation only; see Player.boostVisual). */
export const BOOST_FX_REARM_S = 0.35;
export const ROCKET_SPEED_MULT = 1.5;
export const ROCKET_SECONDS = 6;
export const ROCKET_ALTITUDE = 14;
export const ROLL_SECONDS = 0.5;
export const ROLL_AIR_COST = 8;
export const ROLL_IFRAME = 0.12;
export const RAMP_MIN_LAUNCH = 10;
export const AIR_LOW = 20;
export const AIR_PICKUP = 35;
export const CEILING = 24;
export const HOVER_HEIGHT = 0.55;
export const CRASH_X_LIMIT = laneX(4) + LANE_WIDTH * 0.5;

// Run structure.
export const CRASH_TO_GAMEOVER = 1.2;
export const CRASH_SLOWMO = 0.3;
export const CHAIN_SECONDS = 4;
export const TOD_CYCLE_DISTANCE = 2200;
export const DIFFICULTY_DISTANCE = 3000;
export const HONK_GATE = 2.5;
export const BEST_KEY = "roadsterRush.best";
export const INPUT_EDGES = ["left", "right", "thrustPressed", "rollLeft", "rollRight", "pausePressed", "startPressed"] as const;
export const INPUT_HELD = ["thrust", "dive", "boost"] as const;
export const INPUT_KEYS = [...INPUT_EDGES, ...INPUT_HELD] as const;
export type InputKey = (typeof INPUT_KEYS)[number];
export type InputFrame = Record<InputKey, boolean>;
export const emptyInput = (): InputFrame => ({
  left: false,
  right: false,
  thrustPressed: false,
  rollLeft: false,
  rollRight: false,
  pausePressed: false,
  startPressed: false,
  thrust: false,
  dive: false,
  boost: false
});
