export type ArchitecturalLightingPresetId =
  | "sunrise"
  | "morning"
  | "noon"
  | "afternoon"
  | "golden-hour"
  | "sunset"
  | "dusk"
  | "night";

export type ArchitecturalLightType = "point" | "spot" | "area";
export type ArchitecturalRgb = readonly [number, number, number];
export type ArchitecturalVector3 = readonly [number, number, number];

export interface ArchitecturalLightingFixtureOptions {
  readonly preset?: ArchitecturalLightingPresetId;
  readonly interiorLightsEnabled?: boolean;
}

export interface ArchitecturalInteriorLight {
  readonly id: string;
  readonly type: ArchitecturalLightType;
  readonly position: ArchitecturalVector3;
  readonly color: ArchitecturalRgb;
  readonly intensityLumens: number;
  readonly rangeMeters: number;
  readonly enabled: boolean;
  readonly temperatureKelvin: number;
}

export interface ArchitecturalLightingFixture {
  readonly id: "external-parity-old-branch-architectural-lighting-fixture";
  readonly source: "origin-master-arch-viz-lighting-controller-adapted";
  readonly preset: ArchitecturalLightingPresetId;
  readonly presetLabel: string;
  readonly timeOfDayHours: number;
  readonly sunDirection: ArchitecturalVector3;
  readonly sunColor: ArchitecturalRgb;
  readonly skyColor: ArchitecturalRgb;
  readonly sunIntensity: number;
  readonly ambientIntensity: number;
  readonly interiorLightsEnabled: boolean;
  readonly interiorLights: readonly ArchitecturalInteriorLight[];
  readonly activeInteriorLightCount: number;
  readonly kelvinRange: readonly [number, number];
  readonly supportedCurrentRendererLights: readonly ArchitecturalLightType[];
  readonly blockedLightClaims: readonly string[];
  readonly hash: string;
  readonly claimBoundary: string;
}

const presetDescriptors: Record<ArchitecturalLightingPresetId, {
  readonly label: string;
  readonly timeOfDayHours: number;
  readonly sunIntensity: number;
  readonly sunColor: ArchitecturalRgb;
  readonly skyColor: ArchitecturalRgb;
  readonly ambientIntensity: number;
  readonly interiorLightsOn: boolean;
}> = {
  sunrise: {
    label: "Sunrise",
    timeOfDayHours: 6,
    sunIntensity: 1.5,
    sunColor: [1, 0.7, 0.4],
    skyColor: [0.95, 0.7, 0.6],
    ambientIntensity: 0.15,
    interiorLightsOn: true
  },
  morning: {
    label: "Morning",
    timeOfDayHours: 9,
    sunIntensity: 2.8,
    sunColor: [1, 0.95, 0.88],
    skyColor: [0.6, 0.85, 0.95],
    ambientIntensity: 0.25,
    interiorLightsOn: false
  },
  noon: {
    label: "Noon",
    timeOfDayHours: 12,
    sunIntensity: 4.5,
    sunColor: [1, 0.98, 0.95],
    skyColor: [0.53, 0.81, 0.92],
    ambientIntensity: 0.35,
    interiorLightsOn: false
  },
  afternoon: {
    label: "Afternoon",
    timeOfDayHours: 15,
    sunIntensity: 3.2,
    sunColor: [1, 0.94, 0.85],
    skyColor: [0.58, 0.83, 0.93],
    ambientIntensity: 0.28,
    interiorLightsOn: false
  },
  "golden-hour": {
    label: "Golden Hour",
    timeOfDayHours: 18,
    sunIntensity: 2,
    sunColor: [1, 0.75, 0.5],
    skyColor: [0.95, 0.75, 0.6],
    ambientIntensity: 0.2,
    interiorLightsOn: true
  },
  sunset: {
    label: "Sunset",
    timeOfDayHours: 19.5,
    sunIntensity: 1.2,
    sunColor: [1, 0.5, 0.3],
    skyColor: [0.9, 0.5, 0.4],
    ambientIntensity: 0.15,
    interiorLightsOn: true
  },
  dusk: {
    label: "Dusk",
    timeOfDayHours: 20.5,
    sunIntensity: 0.3,
    sunColor: [0.7, 0.6, 0.9],
    skyColor: [0.25, 0.35, 0.65],
    ambientIntensity: 0.08,
    interiorLightsOn: true
  },
  night: {
    label: "Night",
    timeOfDayHours: 23,
    sunIntensity: 0.15,
    sunColor: [0.7, 0.75, 0.9],
    skyColor: [0.02, 0.03, 0.08],
    ambientIntensity: 0.05,
    interiorLightsOn: true
  }
};

const interiorLightDescriptors: readonly Omit<ArchitecturalInteriorLight, "color" | "enabled">[] = [
  { id: "living-ceiling-1", type: "point", position: [0, 2.7, -2], intensityLumens: 800, rangeMeters: 5, temperatureKelvin: 3000 },
  { id: "living-ceiling-2", type: "point", position: [0, 2.7, 2], intensityLumens: 800, rangeMeters: 5, temperatureKelvin: 3000 },
  { id: "kitchen-task-1", type: "spot", position: [-3, 2.5, -1], intensityLumens: 1200, rangeMeters: 4, temperatureKelvin: 4000 },
  { id: "kitchen-task-2", type: "spot", position: [-3, 2.5, 1], intensityLumens: 1200, rangeMeters: 4, temperatureKelvin: 4000 },
  { id: "bedroom-ambient", type: "point", position: [4, 2.6, 0], intensityLumens: 600, rangeMeters: 6, temperatureKelvin: 2700 },
  { id: "study-desk", type: "spot", position: [3.5, 1.2, -2.5], intensityLumens: 400, rangeMeters: 2.5, temperatureKelvin: 4500 },
  { id: "hallway-1", type: "point", position: [0, 2.5, 5], intensityLumens: 500, rangeMeters: 4, temperatureKelvin: 3500 },
  { id: "hallway-2", type: "point", position: [0, 2.5, -5], intensityLumens: 500, rangeMeters: 4, temperatureKelvin: 3500 },
  { id: "bathroom-main", type: "area", position: [-4, 2.4, 3], intensityLumens: 900, rangeMeters: 3, temperatureKelvin: 5000 },
  { id: "accent-wall", type: "spot", position: [-5.5, 1.5, 0], intensityLumens: 300, rangeMeters: 3, temperatureKelvin: 3200 }
];

export function createArchitecturalLightingFixture(options: ArchitecturalLightingFixtureOptions = {}): ArchitecturalLightingFixture {
  const preset = options.preset ?? "noon";
  const descriptor = presetDescriptors[preset];
  const interiorLightsEnabled = options.interiorLightsEnabled ?? descriptor.interiorLightsOn;
  const interiorLights = interiorLightDescriptors.map((light) => ({
    ...light,
    color: kelvinToRgb(light.temperatureKelvin),
    enabled: interiorLightsEnabled
  }));
  const enabledLights = interiorLights.filter((light) => light.enabled);
  const kelvinValues = interiorLights.map((light) => light.temperatureKelvin);
  const sunDirection = directionForTimeOfDay(descriptor.timeOfDayHours);
  return {
    id: "external-parity-old-branch-architectural-lighting-fixture",
    source: "origin-master-arch-viz-lighting-controller-adapted",
    preset,
    presetLabel: descriptor.label,
    timeOfDayHours: descriptor.timeOfDayHours,
    sunDirection,
    sunColor: descriptor.sunColor,
    skyColor: descriptor.skyColor,
    sunIntensity: descriptor.sunIntensity,
    ambientIntensity: descriptor.ambientIntensity,
    interiorLightsEnabled,
    interiorLights,
    activeInteriorLightCount: enabledLights.length,
    kelvinRange: [Math.min(...kelvinValues), Math.max(...kelvinValues)],
    supportedCurrentRendererLights: ["point", "spot"],
    blockedLightClaims: [
      "physically accurate global illumination",
      "photometric area-light shading parity",
      "Unity/Unreal architectural lighting workflow parity"
    ],
    hash: hashLighting(preset, sunDirection, descriptor, interiorLights),
    claimBoundary: "Deterministic time-of-day sun, Kelvin interior-light metadata, and bounded current-renderer point/spot light evidence adapted from the old arch-viz LightingController; this does not claim GI, baked lighting, photometric area-light, or Unity/Unreal lighting-workflow parity."
  };
}

function directionForTimeOfDay(timeOfDayHours: number): ArchitecturalVector3 {
  const hourAngle = (timeOfDayHours - 6) * 15;
  const elevation = Math.sin(hourAngle * Math.PI / 180) * 60;
  const azimuth = (hourAngle - 90) * Math.PI / 180;
  const x = Math.cos(azimuth) * 50;
  const y = Math.max(elevation, -10);
  const z = Math.sin(azimuth) * 50;
  const length = Math.hypot(x, y, z) || 1;
  return [
    Number((-x / length).toFixed(4)),
    Number((-y / length).toFixed(4)),
    Number((-z / length).toFixed(4))
  ];
}

function kelvinToRgb(kelvin: number): ArchitecturalRgb {
  const temp = kelvin / 100;
  const red = temp <= 66 ? 255 : clamp(329.698727446 * Math.pow(temp - 60, -0.1332047592), 0, 255);
  const green = temp <= 66
    ? clamp(99.4708025861 * Math.log(temp) - 161.1195681661, 0, 255)
    : clamp(288.1221695283 * Math.pow(temp - 60, -0.0755148492), 0, 255);
  const blue = temp >= 66 ? 255 : temp <= 19 ? 0 : clamp(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 0, 255);
  return [roundColor(red / 255), roundColor(green / 255), roundColor(blue / 255)];
}

function hashLighting(
  preset: ArchitecturalLightingPresetId,
  sunDirection: ArchitecturalVector3,
  descriptor: (typeof presetDescriptors)[ArchitecturalLightingPresetId],
  lights: readonly ArchitecturalInteriorLight[]
): string {
  let hash = 0x811c9dc5;
  for (const value of [
    preset.length,
    descriptor.timeOfDayHours,
    descriptor.sunIntensity,
    descriptor.ambientIntensity,
    ...sunDirection,
    ...lights.flatMap((light) => [light.intensityLumens, light.rangeMeters, light.temperatureKelvin, light.enabled ? 1 : 0])
  ]) {
    const scaled = Math.round(value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function roundColor(value: number): number {
  return Number(clamp(value, 0, 1).toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
