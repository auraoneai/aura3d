/**
 * Court geometry, spot definitions, and rooftop stage layout for Rooftop Buckets.
 */

export interface ShotSpot {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly points: 2 | 3;
  readonly sweetPower: number; // Optimal charge ratio [0, 1]
}

export const HOOP_BASE_POSITION = {
  x: 0,
  y: 3.05, // Standard rim height in meters
  z: 0
} as const;

export const BACKBOARD_POSITION = {
  x: 0,
  y: 3.35,
  z: -0.35,
  width: 1.8,
  height: 1.05,
  depth: 0.05
} as const;

export const RIM_DIMENSIONS = {
  radius: 0.225, // 45 cm diameter standard rim
  pipeRadius: 0.015,
  segments: 10
} as const;

export const COURT_SPOTS: readonly ShotSpot[] = [
  { id: 1, name: "Left Mid (2-pt)", x: -2.8, z: 4.2, points: 2, sweetPower: 0.55 },
  { id: 2, name: "Free Throw (2-pt)", x: 0.0, z: 4.6, points: 2, sweetPower: 0.60 },
  { id: 3, name: "Right Mid (2-pt)", x: 2.8, z: 4.2, points: 2, sweetPower: 0.55 },
  { id: 4, name: "Left Wing (3-pt)", x: -4.5, z: 6.2, points: 3, sweetPower: 0.78 },
  { id: 5, name: "Top of Key (3-pt)", x: 0.0, z: 6.8, points: 3, sweetPower: 0.82 },
  { id: 6, name: "Right Wing (3-pt)", x: 4.5, z: 6.2, points: 3, sweetPower: 0.78 }
] as const;

export const COURT_BOUNDS = {
  minX: -8.0,
  maxX: 8.0,
  minZ: -2.0,
  maxZ: 10.0,
  groundY: 0.0
} as const;
