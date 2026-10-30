// PRD-07 P3-T2 — star field: equirect cell hash (one star per cell below a
// density threshold) on the GPU; the CPU helpers below are the same law for
// tests and for the frame packer (stars fade out as the sun clears 6°).

export type Vec3 = readonly [number, number, number];

/**
 * The `stars` field of a sky spec. GU47 E-G (WP-7): the typed authoring form
 * is `{ count, brightness? }` (`sky.preetham` / `sky.gradient`); the raw
 * `{ density, intensity }` form (`sky.dayNight`, older specs) still resolves.
 */
export interface StarSpec {
  /** GU47 E-G: stars visible in the upper hemisphere (fractional counts allowed). Wins over `density`. */
  readonly count?: number;
  /** GU47 E-G: star brightness multiplier (default 1). Wins over `intensity`. */
  readonly brightness?: number;
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
 * GU47 E-G: stars visible above the horizon per unit of `density`. The upper
 * hemisphere is half of the equirect rows, so it holds half the dome's lit
 * cells: `count = density * STARS_PER_DENSITY`.
 */
export const STARS_PER_DENSITY = (STAR_GRID_CELLS * 0.01) / 2;

/** Density at which every cell holds a star (the hash threshold reaches 1). */
export const STAR_DENSITY_MAX = 100;

/** GU47 E-G: the `density` that yields `count` visible stars (clamped to the full dome). */
export function starDensityForCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(STAR_DENSITY_MAX, count / STARS_PER_DENSITY);
}

/** GU47 E-G: expected visible (upper-hemisphere) stars for a resolved `density`. */
export function visibleStarCount(density: number): number {
  return Math.max(0, density) * STARS_PER_DENSITY;
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

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Resolve the optional `stars` spec field (unknown/absent → disabled). */
export function starFrame(raw: unknown): StarFrame {
  const o = (raw ?? {}) as StarSpec;
  const density = typeof o.count === "number" ? starDensityForCount(o.count) : Math.min(STAR_DENSITY_MAX, Math.max(0, finiteOr(o.density, 0)));
  const intensity = Math.max(0, typeof o.brightness === "number" ? finiteOr(o.brightness, 1) : finiteOr(o.intensity, 1));
  return { density, intensity };
}
