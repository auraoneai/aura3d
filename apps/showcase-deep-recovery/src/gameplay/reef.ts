/**
 * Seabed environment, depth zones, wreck obstacles, and recovery buoy.
 *
 * Coordinates:
 *   - Y = 0 is the ocean surface (where the recovery buoy floats).
 *   - Y < 0 is underwater depth:
 *       Zone 1 "Shallow Reef"   : 0m to -15m (multiplier 1.0x)
 *       Zone 2 "Mid Wreck Trench": -15m to -35m (multiplier 1.5x, oxygen drain 1.4x)
 *       Zone 3 "Abyssal Chasm"  : -35m to -60m (multiplier 2.5x, oxygen drain 2.0x, hull creaks)
 *   - Seabed floor sits at Y = -60m to -65m.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DepthZone {
  readonly id: 1 | 2 | 3;
  readonly name: string;
  readonly minY: number;
  readonly maxY: number;
  readonly valueMultiplier: number;
  readonly oxygenDrainRate: number; // base drain per second
  readonly fogDensity: number;
  readonly ambientColor: string;
}

export const DEPTH_ZONES: readonly DepthZone[] = [
  {
    id: 1,
    name: "Shallow Reef",
    minY: -15,
    maxY: 0,
    valueMultiplier: 1.0,
    oxygenDrainRate: 0.8,
    fogDensity: 0.012,
    ambientColor: "#0a2236"
  },
  {
    id: 2,
    name: "Mid Wreck Trench",
    minY: -35,
    maxY: -15,
    valueMultiplier: 1.5,
    oxygenDrainRate: 1.2,
    fogDensity: 0.022,
    ambientColor: "#051320"
  },
  {
    id: 3,
    name: "Abyssal Chasm",
    minY: -65,
    maxY: -35,
    valueMultiplier: 2.5,
    oxygenDrainRate: 1.8,
    fogDensity: 0.038,
    ambientColor: "#02070e"
  }
];

export function getDepthZone(y: number): DepthZone {
  if (y > -15) return DEPTH_ZONES[0]!;
  if (y > -35) return DEPTH_ZONES[1]!;
  return DEPTH_ZONES[2]!;
}

export interface WreckObstacle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
}

export const WRECK_OBSTACLES: readonly WreckObstacle[] = [
  { id: "wreck-mast-1", x: -7, y: -12, z: -13, radius: 2.5, height: 10 },
  { id: "wreck-hull-1", x: 18, y: -45, z: 12, radius: 4.0, height: 8 },
  { id: "wreck-boiler-1", x: 6, y: -52, z: -20, radius: 3.2, height: 6 },
  { id: "reef-spire-1", x: -22, y: -18, z: 24, radius: 3.0, height: 14 },
  { id: "reef-arch-1", x: 2, y: -30, z: 32, radius: 3.5, height: 12 }
];

export const BUOY_STATION = {
  x: 0,
  y: 0,
  z: 0,
  dockRadius: 5.5,
  sensorRadius: 4.5
};

export const WORLD_BOUNDS = {
  minX: -55,
  maxX: 55,
  minZ: -55,
  maxZ: 55,
  surfaceY: 0,
  seabedY: -62
};
