import { type V4EnvironmentPreset } from "./V4RenderPreset";
import { createV4IblResources, type V4IblResourceSet } from "./IBL";

export type V4EnvironmentTarget =
  | "studio-softbox-hdr"
  | "gallery-neutral-hdr"
  | "outdoor-overcast-hdr"
  | "warehouse-industrial-hdr"
  | "night-neon-hdr";

export interface V4EnvironmentPipelineOptions {
  readonly target: V4EnvironmentTarget;
  readonly rotation?: number;
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
}

export interface V4EnvironmentPipeline {
  readonly target: V4EnvironmentTarget;
  readonly preset: V4EnvironmentPreset;
  readonly sourceManifest: "fixtures/external-parity/environments/manifest.json";
  readonly sourceStatus: "bootstrap-generated-until-licensed-hdr-acquired";
  readonly ibl: V4IblResourceSet;
  readonly capabilities: readonly string[];
  readonly releaseBlockers: readonly string[];
}

const TARGET_TO_PRESET: Readonly<Record<V4EnvironmentTarget, V4EnvironmentPreset>> = {
  "studio-softbox-hdr": "softbox",
  "gallery-neutral-hdr": "exhibit",
  "outdoor-overcast-hdr": "daylight",
  "warehouse-industrial-hdr": "inspection",
  "night-neon-hdr": "evening"
};

export function createV4EnvironmentPipeline(options: V4EnvironmentPipelineOptions): V4EnvironmentPipeline {
  const preset = TARGET_TO_PRESET[options.target];
  const ibl = createV4IblResources({
    preset,
    rotation: options.rotation,
    intensity: options.intensity,
    backgroundIntensity: options.backgroundIntensity,
    sourceQuality: "bootstrap-generated"
  });
  return {
    target: options.target,
    preset,
    sourceManifest: "fixtures/external-parity/environments/manifest.json",
    sourceStatus: "bootstrap-generated-until-licensed-hdr-acquired",
    ibl,
    capabilities: [
      "linear HDR source",
      "diffuse irradiance",
      "specular prefilter mips",
      "BRDF LUT",
      "environment rotation",
      "environment intensity",
      "background/environment separation"
    ],
    releaseBlockers: [
      "Replace bootstrap-generated environment source with licensed HDR environment before flagship visual proof.",
      "Capture same-scene Three.js screenshots for each flagship environment-dependent scene."
    ]
  };
}

export function listV4EnvironmentTargets(): readonly V4EnvironmentTarget[] {
  return Object.keys(TARGET_TO_PRESET) as V4EnvironmentTarget[];
}
