export type V8EnvironmentId = "studio-small-08" | "venice-sunset" | "industrial-sunset-puresky";

export interface V8EnvironmentPreset {
  readonly id: V8EnvironmentId;
  readonly label: string;
  readonly localPath: string;
  readonly class: "studio" | "outdoor" | "industrial";
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly rotation: number;
}

export const V8_ENVIRONMENTS: readonly V8EnvironmentPreset[] = [
  {
    id: "studio-small-08",
    label: "Studio Small 08",
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    class: "studio",
    intensity: 1.15,
    backgroundIntensity: 0.85,
    exposure: 1,
    whitePoint: 11.2,
    rotation: 0.15
  },
  {
    id: "venice-sunset",
    label: "Venice Sunset",
    localPath: "fixtures/environment-corpus/hdri/venice_sunset_1k.hdr",
    class: "outdoor",
    intensity: 1.35,
    backgroundIntensity: 0.95,
    exposure: 0.9,
    whitePoint: 10.4,
    rotation: 0.62
  },
  {
    id: "industrial-sunset-puresky",
    label: "Industrial Sunset Pure Sky",
    localPath: "fixtures/environment-corpus/hdri/industrial_sunset_puresky_1k.hdr",
    class: "industrial",
    intensity: 1.28,
    backgroundIntensity: 0.92,
    exposure: 0.88,
    whitePoint: 10.7,
    rotation: 0.34
  }
] as const;

export function listV8Environments(): readonly V8EnvironmentPreset[] {
  return V8_ENVIRONMENTS;
}

export function resolveV8Environment(id: V8EnvironmentId = "studio-small-08"): V8EnvironmentPreset {
  const environment = V8_ENVIRONMENTS.find((entry) => entry.id === id);
  if (!environment) throw new Error(`Unknown V8 environment: ${id}`);
  return environment;
}

export function v8EnvironmentUrl(environment: V8EnvironmentPreset, origin = ""): string {
  const prefix = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${prefix}/${environment.localPath}`;
}
