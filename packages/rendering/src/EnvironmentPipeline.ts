import { type ExternalParityEnvironmentPreset } from "./ExternalParityRenderPreset";
import { createExternalParityIblResources, type ExternalParityIblResourceSet } from "./IBL";

export type ExternalParityEnvironmentTarget =
  | "studio-softbox-hdr"
  | "gallery-neutral-hdr"
  | "outdoor-overcast-hdr"
  | "warehouse-industrial-hdr"
  | "night-neon-hdr";

export interface ExternalParityEnvironmentPipelineOptions {
  readonly target: ExternalParityEnvironmentTarget;
  readonly rotation?: number;
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
}

export interface ExternalParityEnvironmentPipeline {
  readonly target: ExternalParityEnvironmentTarget;
  readonly preset: ExternalParityEnvironmentPreset;
  readonly sourceManifest: "fixtures/external-parity/environments/manifest.json";
  readonly sourceStatus: "bootstrap-generated-until-licensed-hdr-acquired";
  readonly ibl: ExternalParityIblResourceSet;
  readonly capabilities: readonly string[];
  readonly releaseBlockers: readonly string[];
}

const TARGET_TO_PRESET: Readonly<Record<ExternalParityEnvironmentTarget, ExternalParityEnvironmentPreset>> = {
  "studio-softbox-hdr": "softbox",
  "gallery-neutral-hdr": "exhibit",
  "outdoor-overcast-hdr": "daylight",
  "warehouse-industrial-hdr": "inspection",
  "night-neon-hdr": "evening"
};

export function createExternalParityEnvironmentPipeline(options: ExternalParityEnvironmentPipelineOptions): ExternalParityEnvironmentPipeline {
  const preset = TARGET_TO_PRESET[options.target];
  const ibl = createExternalParityIblResources({
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

export function listExternalParityEnvironmentTargets(): readonly ExternalParityEnvironmentTarget[] {
  return Object.keys(TARGET_TO_PRESET) as ExternalParityEnvironmentTarget[];
}
