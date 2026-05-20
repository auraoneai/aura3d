export type WeatherFixtureType = "clear" | "cloudy" | "rain" | "heavy-rain" | "thunderstorm" | "snow";

export interface WeatherFixtureOptions {
  readonly type?: WeatherFixtureType;
  readonly elapsedSeconds?: number;
  readonly seed?: number;
  readonly cameraX?: number;
  readonly cameraZ?: number;
  readonly maxVisualDrops?: number;
}

export interface WeatherVisualDrop {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly alpha: number;
}

export interface WeatherPuddlePatch {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly depth: number;
}

export interface WeatherFixtureSample {
  readonly type: WeatherFixtureType;
  readonly cloudCoverage: number;
  readonly fogDensity: number;
  readonly rainIntensity: number;
  readonly snowIntensity: number;
  readonly windSpeed: number;
  readonly windDirectionX: number;
  readonly windDirectionZ: number;
  readonly lightningFrequency: number;
  readonly visibleDropCount: number;
  readonly splashCount: number;
  readonly puddleDepth: number;
  readonly wetness: number;
  readonly ambientIntensity: number;
  readonly visibilityMeters: number;
  readonly visualDrops: readonly WeatherVisualDrop[];
  readonly puddlePatches: readonly WeatherPuddlePatch[];
  readonly hash: string;
  readonly source: "origin-master-weather-system-adapted";
  readonly claimBoundary: string;
}

export function sampleWeatherFixture(options: WeatherFixtureOptions = {}): WeatherFixtureSample {
  const type = options.type ?? "rain";
  const preset = weatherPreset(type);
  const elapsedSeconds = Math.max(0, finite(options.elapsedSeconds ?? 1, "elapsedSeconds"));
  const seed = Math.floor(options.seed ?? 0x5ea50a);
  if (!Number.isInteger(seed)) {
    throw new RangeError("Weather fixture seed must be an integer.");
  }
  const cameraX = finite(options.cameraX ?? 0, "cameraX");
  const cameraZ = finite(options.cameraZ ?? 0, "cameraZ");
  const windGust = (seeded01(seed + Math.floor(elapsedSeconds * 17)) * 2 - 1) * preset.windGustiness;
  const windSpeed = Math.max(0, preset.windSpeed * (1 + windGust));
  const weatherLoad = preset.rainIntensity + preset.snowIntensity;
  const visibleDropCount = Math.round(weatherLoad * 420 + windSpeed * 8 + Math.abs(cameraX + cameraZ) * 3);
  const splashCount = Math.round(preset.rainIntensity * elapsedSeconds * 180);
  const puddleDepth = clamp(preset.rainIntensity * elapsedSeconds * 0.018 + preset.wetnessRate * 0.08, 0, 1);
  const wetness = clamp(preset.wetnessRate + puddleDepth * 0.45, 0, 1);
  const visualDrops = sampleVisualDrops({
    count: Math.min(Math.max(0, Math.floor(options.maxVisualDrops ?? 36)), visibleDropCount),
    seed,
    elapsedSeconds,
    cameraX,
    cameraZ,
    intensity: weatherLoad,
    windSpeed
  });
  const puddlePatches = samplePuddlePatches({
    count: preset.rainIntensity > 0 ? Math.max(1, Math.min(8, Math.round(preset.rainIntensity * 8))) : 0,
    seed,
    cameraX,
    cameraZ,
    depth: puddleDepth
  });
  const hash = hashWeather([
    preset.cloudCoverage,
    preset.fogDensity,
    preset.rainIntensity,
    preset.snowIntensity,
    windSpeed,
    visibleDropCount,
    splashCount,
    puddleDepth,
    wetness,
    preset.visibility,
    visualDrops.length,
    puddlePatches.length
  ]);
  return {
    type,
    cloudCoverage: preset.cloudCoverage,
    fogDensity: preset.fogDensity,
    rainIntensity: preset.rainIntensity,
    snowIntensity: preset.snowIntensity,
    windSpeed: Number(windSpeed.toFixed(4)),
    windDirectionX: preset.windDirectionX,
    windDirectionZ: preset.windDirectionZ,
    lightningFrequency: preset.lightningFrequency,
    visibleDropCount,
    splashCount,
    puddleDepth: Number(puddleDepth.toFixed(4)),
    wetness: Number(wetness.toFixed(4)),
    ambientIntensity: preset.ambientIntensity,
    visibilityMeters: preset.visibility,
    visualDrops,
    puddlePatches,
    hash,
    source: "origin-master-weather-system-adapted",
    claimBoundary: "Deterministic weather, wind, rain/snow particle-count, splash, puddle, wetness, fog, and cloud telemetry adapted from the old weather system; this is bounded scene evidence, not volumetric clouds, full precipitation rendering, atmospheric scattering, or weather simulation parity."
  };
}

function weatherPreset(type: WeatherFixtureType): {
  readonly cloudCoverage: number;
  readonly fogDensity: number;
  readonly rainIntensity: number;
  readonly snowIntensity: number;
  readonly windSpeed: number;
  readonly windDirectionX: number;
  readonly windDirectionZ: number;
  readonly windGustiness: number;
  readonly lightningFrequency: number;
  readonly ambientIntensity: number;
  readonly wetnessRate: number;
  readonly visibility: number;
} {
  switch (type) {
    case "clear":
      return { cloudCoverage: 0.1, fogDensity: 0, rainIntensity: 0, snowIntensity: 0, windSpeed: 2, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.1, lightningFrequency: 0, ambientIntensity: 0.8, wetnessRate: 0, visibility: 50_000 };
    case "cloudy":
      return { cloudCoverage: 0.85, fogDensity: 0.1, rainIntensity: 0, snowIntensity: 0, windSpeed: 5, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.3, lightningFrequency: 0, ambientIntensity: 0.6, wetnessRate: 0, visibility: 20_000 };
    case "heavy-rain":
      return { cloudCoverage: 1, fogDensity: 0.3, rainIntensity: 0.9, snowIntensity: 0, windSpeed: 9, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.5, lightningFrequency: 1.5, ambientIntensity: 0.4, wetnessRate: 0.9, visibility: 5_000 };
    case "thunderstorm":
      return { cloudCoverage: 1, fogDensity: 0.35, rainIntensity: 1, snowIntensity: 0, windSpeed: 12, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.7, lightningFrequency: 3, ambientIntensity: 0.35, wetnessRate: 1, visibility: 3_000 };
    case "snow":
      return { cloudCoverage: 0.95, fogDensity: 0.2, rainIntensity: 0, snowIntensity: 0.6, windSpeed: 5.5, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.35, lightningFrequency: 0, ambientIntensity: 0.6, wetnessRate: 0.2, visibility: 8_000 };
    case "rain":
      return { cloudCoverage: 0.9, fogDensity: 0.2, rainIntensity: 0.6, snowIntensity: 0, windSpeed: 6.5, windDirectionX: 1, windDirectionZ: 0, windGustiness: 0.4, lightningFrequency: 0.5, ambientIntensity: 0.5, wetnessRate: 0.6, visibility: 10_000 };
  }
}

function hashWeather(values: readonly number[]): string {
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

function sampleVisualDrops(options: {
  readonly count: number;
  readonly seed: number;
  readonly elapsedSeconds: number;
  readonly cameraX: number;
  readonly cameraZ: number;
  readonly intensity: number;
  readonly windSpeed: number;
}): readonly WeatherVisualDrop[] {
  return Array.from({ length: options.count }, (_, index): WeatherVisualDrop => {
    const lane = seeded01(options.seed + index * 97);
    const fall = (seeded01(options.seed ^ (index * 131)) + options.elapsedSeconds * (0.42 + options.intensity * 0.18)) % 1;
    const x = options.cameraX - 1.25 + lane * 2.5 + Math.sin(options.elapsedSeconds * 1.7 + index) * 0.025;
    const z = options.cameraZ - 0.38 + seeded01(options.seed + index * 53) * 0.76;
    const y = 0.78 - fall * 1.38;
    return {
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      z: Number(z.toFixed(4)),
      length: Number((0.055 + options.intensity * 0.055 + options.windSpeed * 0.003).toFixed(4)),
      alpha: Number((0.28 + options.intensity * 0.36).toFixed(4))
    };
  });
}

function samplePuddlePatches(options: {
  readonly count: number;
  readonly seed: number;
  readonly cameraX: number;
  readonly cameraZ: number;
  readonly depth: number;
}): readonly WeatherPuddlePatch[] {
  return Array.from({ length: options.count }, (_, index): WeatherPuddlePatch => {
    const x = options.cameraX - 1.08 + seeded01(options.seed + index * 19) * 2.16;
    const z = options.cameraZ - 0.32 + seeded01(options.seed + index * 47) * 0.64;
    const radius = 0.035 + seeded01(options.seed ^ (index * 83)) * 0.05 + options.depth * 0.08;
    return {
      x: Number(x.toFixed(4)),
      z: Number(z.toFixed(4)),
      radius: Number(radius.toFixed(4)),
      depth: Number(options.depth.toFixed(4))
    };
  });
}

function seeded01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Weather fixture ${label} must be finite.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
