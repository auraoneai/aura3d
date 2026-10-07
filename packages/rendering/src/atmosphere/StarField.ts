// PRD-07 P3-T2 — star field: equirect cell hash (one star per cell below a
// density threshold) on the GPU; the CPU helpers below are the same law for
// tests and for the frame packer (stars fade out as the sun clears 6°).

export type Vec3 = readonly [number, number, number];

export interface StarSpec {
  /** Cell occupancy scale — a cell holds a star when hash(cell) < density*0.01. */
  readonly density?: number;
  readonly intensity?: number;
}

export interface StarFrame {
  readonly density: number;
  readonly intensity: number;
}

/** Sky dome cells: 512×512 equirect grid (matches the shader's `uv * 512`). */
export const STAR_GRID_CELLS = 512 * 512;

/** Occupancy fraction per cell — the shader's `density * 0.01` threshold. */
export function starCellOccupancy(density: number): number {
  return Math.max(0, density) * 0.01;
}

/** Expected lit cells on the dome — linear in `density` (test-visible). */
export function expectedStarCount(density: number): number {
  return Math.round(STAR_GRID_CELLS * starCellOccupancy(density));
}

/**
 * Stars fade to 0 once the sun's elevation exceeds 6 degrees (twilight curve):
 * 1 at/below the horizon, smoothstep to 0 at +6°.
 */
export function starVisibilityAtSunElevation(sunElevationDeg: number): number {
  const t = Math.max(0, Math.min(1, (6 - sunElevationDeg) / 6));
  return t * t * (3 - 2 * t);
}

/** Same fade for a sun direction vector (y = sin elevation). */
export function starVisibilityAtSunDirection(sunDirection: Vec3): number {
  return starVisibilityAtSunElevation((Math.asin(Math.max(-1, Math.min(1, sunDirection[1]))) * 180) / Math.PI);
}

/** Resolve the optional `stars` spec field (unknown/absent → disabled). */
export function starFrame(raw: unknown): StarFrame {
  const o = (raw ?? {}) as StarSpec;
  return { density: o.density ?? 0, intensity: o.intensity ?? 1 };
}
