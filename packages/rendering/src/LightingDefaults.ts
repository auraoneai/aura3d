import { createExternalParityEnvironmentLighting } from "./ExternalParityRenderPreset";
import type { EnvironmentLightingOptions } from "./ForwardPass";
import type { RendererPostProcessOptions, RendererShadowOptions } from "./Renderer";

export type LightingDefaultPreset = "studioProduct" | "outdoorDay" | "interiorGallery" | "gameNight";

export interface LightingDefault {
  readonly id: LightingDefaultPreset;
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly shadow: RendererShadowOptions;
  readonly postprocess: RendererPostProcessOptions;
}

export function createLightingDefault(preset: LightingDefaultPreset = "studioProduct"): LightingDefault {
  const environment = createExternalParityEnvironmentLighting(environmentPresetFor(preset)).lighting;
  return {
    id: preset,
    environmentLighting: environment,
    exposure: exposureFor(preset),
    whitePoint: preset === "gameNight" ? 1.05 : 1.25,
    shadow: {
      enabled: true,
      size: preset === "studioProduct" ? 768 : 1024,
      strength: preset === "gameNight" ? 0.52 : 0.42,
      bias: 0.0025,
      slopeBias: 1.2,
      filter: "pcf",
      pcfRadius: 1.25,
      pcfSamples: 9
    },
    postprocess: {
      targetFormat: "rgba16f",
      toneMapping: {
        operator: "filmic",
        exposure: exposureFor(preset),
        whitePoint: preset === "gameNight" ? 1.05 : 1.25,
        inputColorSpace: "linear",
        outputColorSpace: "srgb"
      },
      colorGrade: {
        contrast: preset === "gameNight" ? 1.16 : 1.1,
        saturation: preset === "interiorGallery" ? 1.02 : 1.08,
        vibrance: preset === "studioProduct" ? 0.16 : 0.1,
        vignette: preset === "outdoorDay" ? 0.05 : 0.12,
        sharpening: 0.28
      },
      bloom: { threshold: preset === "gameNight" ? 0.72 : 0.82, intensity: preset === "gameNight" ? 0.16 : 0.1, radius: 1 },
      fxaa: true
    }
  };
}

function environmentPresetFor(preset: LightingDefaultPreset): Parameters<typeof createExternalParityEnvironmentLighting>[0] {
  switch (preset) {
    case "outdoorDay":
      return "inspection";
    case "interiorGallery":
      return "softbox";
    case "gameNight":
      return "exhibit";
    case "studioProduct":
      return "studio";
  }
}

function exposureFor(preset: LightingDefaultPreset): number {
  switch (preset) {
    case "outdoorDay":
      return 1.0;
    case "interiorGallery":
      return 1.08;
    case "gameNight":
      return 1.28;
    case "studioProduct":
      return 1.12;
  }
}
