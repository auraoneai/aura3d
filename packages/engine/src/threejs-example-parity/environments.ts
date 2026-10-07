export type CurrentRoutesEnvironmentId = "studio-small-08" | "venice-sunset" | "industrial-sunset-puresky";

export interface CurrentRoutesEnvironmentPreset {
  readonly id: CurrentRoutesEnvironmentId;
  readonly label: string;
  readonly localPath: string;
  readonly class: "studio" | "outdoor" | "industrial";
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly rotation: number;
}

export const CURRENT_ROUTES_ENVIRONMENTS: readonly CurrentRoutesEnvironmentPreset[] = [
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
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
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
    localPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    class: "industrial",
    intensity: 1.28,
    backgroundIntensity: 0.92,
    exposure: 0.88,
    whitePoint: 10.7,
    rotation: 0.34
  }
] as const;

export function listCurrentRoutesEnvironments(): readonly CurrentRoutesEnvironmentPreset[] {
  return CURRENT_ROUTES_ENVIRONMENTS;
}

export function resolveCurrentRoutesEnvironment(id: CurrentRoutesEnvironmentId = "studio-small-08"): CurrentRoutesEnvironmentPreset {
  const environment = CURRENT_ROUTES_ENVIRONMENTS.find((entry) => entry.id === id);
  if (!environment) throw new Error(`Unknown CurrentRoutes environment: ${id}`);
  return environment;
}

export function currentRoutesEnvironmentUrl(environment: CurrentRoutesEnvironmentPreset, origin = ""): string {
  const prefix = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${prefix}/${environment.localPath}`;
}
