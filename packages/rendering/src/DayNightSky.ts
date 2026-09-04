/**
 * D3 day/night sky descriptor (PRD D3 box 1).
 *
 * Pure deterministic descriptor for a time-of-day sky: gradient keyframes
 * (zenith/horizon hex), a sun disc, a moon disc with phase, a seeded star
 * field, and 2D value-noise cloud cells.
 *
 * Claim boundary: this is a color-gradient dome with sprite/disc overlays.
 * There is no scattering simulation here — Rayleigh/Mie models are excluded
 * and must not be claimed from this module.
 */

export interface DayNightSkyOptions {
  /** Hour of day in [0, 24). 12 is solar noon, 0 is midnight. */
  readonly hour?: number;
  readonly seed?: number;
  readonly starCount?: number;
  readonly cloudCellCount?: number;
}

export interface DayNightSkyDisc {
  readonly azimuthRadians: number;
  readonly elevationRadians: number;
  readonly angularRadius: number;
  readonly color: string;
  readonly intensity: number;
}

export interface DayNightSkyStar {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly brightness: number;
}

export interface DayNightSkyCloudCell {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly coverage: number;
  readonly alpha: number;
}

export interface DayNightSkyState {
  readonly hour: number;
  readonly seed: number;
  /** 0 at midnight, 1 at solar noon. */
  readonly dayFactor: number;
  /** 1 at midnight, 0 at solar noon. */
  readonly nightFactor: number;
  readonly zenithColor: string;
  readonly horizonColor: string;
  readonly sun: DayNightSkyDisc;
  readonly moon: DayNightSkyDisc & { readonly phase: number };
  readonly stars: readonly DayNightSkyStar[];
  readonly visibleStarCount: number;
  readonly clouds: readonly DayNightSkyCloudCell[];
  readonly averageCloudCoverage: number;
  readonly claimBoundary: string;
  readonly hash: string;
}

export const DAY_NIGHT_SKY_CLAIM_BOUNDARY =
  "Time-of-day gradient dome with sun/moon discs, seeded stars, and 2D-noise clouds. " +
  "Scattering-simulation claims are excluded: no Rayleigh/Mie model is implemented or implied.";

interface SkyKeyframe {
  readonly hour: number;
  readonly dayFactor: number;
  readonly zenith: readonly [number, number, number];
  readonly horizon: readonly [number, number, number];
}

const skyKeyframes: readonly SkyKeyframe[] = [
  { hour: 0, dayFactor: 0, zenith: [0x02, 0x06, 0x17], horizon: [0x0a, 0x14, 0x33] },
  { hour: 5, dayFactor: 0, zenith: [0x02, 0x06, 0x17], horizon: [0x0a, 0x14, 0x33] },
  { hour: 6.5, dayFactor: 0.35, zenith: [0x2b, 0x4a, 0x7a], horizon: [0xf5, 0x9e, 0x5c] },
  { hour: 8, dayFactor: 0.8, zenith: [0x3f, 0x7d, 0xd6], horizon: [0xbf, 0xe2, 0xff] },
  { hour: 12, dayFactor: 1, zenith: [0x1f, 0x5f, 0xc4], horizon: [0x8f, 0xc9, 0xff] },
  { hour: 16, dayFactor: 0.8, zenith: [0x3f, 0x7d, 0xd6], horizon: [0xbf, 0xe2, 0xff] },
  { hour: 17.5, dayFactor: 0.35, zenith: [0x2b, 0x4a, 0x7a], horizon: [0xf5, 0x9e, 0x5c] },
  { hour: 19, dayFactor: 0, zenith: [0x02, 0x06, 0x17], horizon: [0x0a, 0x14, 0x33] },
  { hour: 24, dayFactor: 0, zenith: [0x02, 0x06, 0x17], horizon: [0x0a, 0x14, 0x33] }
];

export function createDayNightSky(options: DayNightSkyOptions = {}): DayNightSkyState {
  const hour = options.hour ?? 12;
  if (!Number.isFinite(hour) || hour < 0 || hour >= 24) {
    throw new RangeError("Day/night sky hour must be in [0, 24).");
  }
  const seed = Math.floor(options.seed ?? 0xd3a7);
  if (!Number.isInteger(seed)) throw new RangeError("Day/night sky seed must be an integer.");
  const starCount = rangeInt(options.starCount ?? 90, 0, 400, "starCount");
  const cloudCellCount = rangeInt(options.cloudCellCount ?? 14, 0, 64, "cloudCellCount");

  const lower = [...skyKeyframes].reverse().find((key) => key.hour <= hour) ?? skyKeyframes[0]!;
  const upper = skyKeyframes.find((key) => key.hour > hour) ?? skyKeyframes[skyKeyframes.length - 1]!;
  const span = Math.max(1e-6, upper.hour - lower.hour);
  const t = (hour - lower.hour) / span;
  const dayFactor = lower.dayFactor + (upper.dayFactor - lower.dayFactor) * t;
  const nightFactor = 1 - dayFactor;
  const zenith = lerpRgb(lower.zenith, upper.zenith, t);
  const horizon = lerpRgb(lower.horizon, upper.horizon, t);

  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sun: DayNightSkyDisc = {
    azimuthRadians: round4(sunAngle),
    elevationRadians: round4(Math.sin(sunAngle) * 1.1),
    angularRadius: 0.055,
    color: dayFactor > 0.25 ? "#fff7d6" : "#ff9e5c",
    intensity: round4(0.25 + dayFactor * 0.75)
  };
  const moonAngle = sunAngle + Math.PI;
  const phase = (seeded01(seed ^ 0x9e37) * 0.9 + 0.1);
  const moon: DayNightSkyDisc & { readonly phase: number } = {
    azimuthRadians: round4(moonAngle),
    elevationRadians: round4(Math.sin(moonAngle) * 1.1),
    angularRadius: 0.042,
    color: "#dbeafe",
    intensity: round4(0.2 + nightFactor * 0.8),
    phase: round4(phase)
  };

  const stars = Array.from({ length: starCount }, (_, index): DayNightSkyStar => ({
    x: round4(seeded01(seed + index * 101) * 2 - 1),
    y: round4(seeded01(seed + index * 331) * 1.4 - 0.15),
    size: round4(0.004 + seeded01(seed + index * 557) * 0.01),
    brightness: round4((0.35 + seeded01(seed + index * 733) * 0.65) * nightFactor)
  }));
  const visibleStarCount = stars.filter((star) => star.brightness > 0.05 && star.y > 0).length;

  const clouds = Array.from({ length: cloudCellCount }, (_, index): DayNightSkyCloudCell => {
    const x = seeded01(seed + index * 37) * 2 - 1;
    const y = 0.12 + seeded01(seed + index * 71) * 0.62;
    const coverage = sampleCloudNoise(x, y, seed);
    return {
      x: round4(x),
      y: round4(y),
      radius: round4(0.1 + seeded01(seed + index * 113) * 0.22),
      coverage: round4(coverage),
      alpha: round4(coverage * (0.25 + dayFactor * 0.55))
    };
  });
  const averageCloudCoverage = clouds.length === 0
    ? 0
    : round4(clouds.reduce((sum, cell) => sum + cell.coverage, 0) / clouds.length);

  const hash = hashValues([
    hour, dayFactor, zenith[0], zenith[1], zenith[2], horizon[0], horizon[1], horizon[2],
    sun.elevationRadians, moon.elevationRadians, visibleStarCount, averageCloudCoverage,
    stars.length, clouds.length
  ]);
  return {
    hour,
    seed,
    dayFactor: round4(dayFactor),
    nightFactor: round4(nightFactor),
    zenithColor: rgbToHex(zenith),
    horizonColor: rgbToHex(horizon),
    sun,
    moon,
    stars,
    visibleStarCount,
    clouds,
    averageCloudCoverage,
    claimBoundary: DAY_NIGHT_SKY_CLAIM_BOUNDARY,
    hash
  };
}

/** Seeded 2D value-noise cloud density in [0, 1]. Exported for route builders. */
export function sampleCloudNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x * 4);
  const yi = Math.floor(y * 4);
  const xf = x * 4 - xi;
  const yf = y * 4 - yi;
  const smooth = (v: number): number => v * v * (3 - 2 * v);
  const corner = (dx: number, dy: number): number => seeded01((seed ^ (xi + dx) * 374761393 ^ (yi + dy) * 668265263) >>> 0);
  const top = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * smooth(xf);
  const bottom = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * smooth(xf);
  const value = top + (bottom - top) * smooth(yf);
  return Math.max(0, Math.min(1, (value - 0.32) / 0.36));
}

function lerpRgb(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  const toHex = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function seeded01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}

function rangeInt(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Day/night sky ${label} must be an integer in [${min}, ${max}].`);
  }
  return value;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function hashValues(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
