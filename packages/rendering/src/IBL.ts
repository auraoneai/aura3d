import {
  createEnvironmentMapResourceSet,
  type EnvironmentMapResourceSet,
  type LinearHdrEnvironmentMapSource
} from "./EnvironmentMapResources";
import { createV4GeneratedHdrEnvironmentMapSource, type V4EnvironmentPreset } from "./V4RenderPreset";
import { createV4BrdfLut, type V4BrdfLut } from "./BRDFLut";
import { createV4Pmrem, type V4Pmrem } from "./PMREM";

export interface V4IblOptions {
  readonly preset: V4EnvironmentPreset;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
  readonly sourceQuality?: "bootstrap-generated" | "licensed-hdr";
}

export interface V4IblResourceSet {
  readonly preset: V4EnvironmentPreset;
  readonly source: LinearHdrEnvironmentMapSource;
  readonly resources: EnvironmentMapResourceSet;
  readonly pmrem: V4Pmrem;
  readonly brdfLut: V4BrdfLut;
  readonly rotation: number;
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly diagnostics: {
    readonly sourceQuality: "bootstrap-generated" | "licensed-hdr";
    readonly notFlagshipProof: boolean;
    readonly hdrSource: boolean;
    readonly maxLinearValue: number;
    readonly diffuseIrradiance: boolean;
    readonly specularPrefilter: boolean;
    readonly brdfLut: boolean;
    readonly environmentRotation: boolean;
    readonly environmentIntensity: boolean;
    readonly backgroundSeparation: boolean;
  };
}

export function createV4IblResources(options: V4IblOptions): V4IblResourceSet {
  const source = createV4GeneratedHdrEnvironmentMapSource(options.preset, options.width ?? 128, options.height ?? 64);
  const resources = createEnvironmentMapResourceSet({ ...source, encoding: "linear-hdr" }, {
    outputColorSpace: "srgb",
    exposure: 1,
    toneMapping: "reinhard",
    specularLevels: 6,
    specularBlurRadius: 3,
    irradianceWidth: 16,
    irradianceHeight: 8,
    irradianceBlurRadius: 8,
    brdfLutSize: 64
  });
  const pmrem = createV4Pmrem(resources.base, {
    levels: 6,
    blurRadius: 3,
    textureLabel: `v4-${options.preset}-pmrem`
  });
  const brdfLut = createV4BrdfLut(64);
  const sourceQuality = options.sourceQuality ?? "bootstrap-generated";

  return {
    preset: options.preset,
    source,
    resources,
    pmrem,
    brdfLut,
    rotation: options.rotation ?? 0,
    intensity: options.intensity ?? 1,
    backgroundIntensity: options.backgroundIntensity ?? 0.35,
    diagnostics: {
      sourceQuality,
      notFlagshipProof: sourceQuality !== "licensed-hdr",
      hdrSource: resources.diagnostics.hdrSource,
      maxLinearValue: resources.diagnostics.maxLinearValue,
      diffuseIrradiance: resources.diffuseIrradiance.width > 0 && resources.diffuseIrradiance.height > 0,
      specularPrefilter: resources.specularMipLevels.length >= 4 && pmrem.diagnostics.directionalReflectionReady,
      brdfLut: brdfLut.diagnostics.nonZeroPixels > 0 && brdfLut.diagnostics.monotonicRoughnessTrend,
      environmentRotation: Number.isFinite(options.rotation ?? 0),
      environmentIntensity: Number.isFinite(options.intensity ?? 1) && (options.intensity ?? 1) > 0,
      backgroundSeparation: Number.isFinite(options.backgroundIntensity ?? 0.35) && (options.backgroundIntensity ?? 0.35) !== (options.intensity ?? 1)
    }
  };
}
