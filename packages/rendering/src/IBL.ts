import {
  createEnvironmentMapResourceSet,
  type EnvironmentMapResourceSet,
  type LinearHdrEnvironmentMapSource
} from "./EnvironmentMapResources";
import { createExternalParityGeneratedHdrEnvironmentMapSource, type ExternalParityEnvironmentPreset } from "./ExternalParityRenderPreset";
import { createExternalParityBrdfLut, type ExternalParityBrdfLut } from "./BRDFLut";
import { createExternalParityPmrem, type ExternalParityPmrem } from "./PMREM";

export interface ExternalParityIblOptions {
  readonly preset: ExternalParityEnvironmentPreset;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
  readonly sourceQuality?: "bootstrap-generated" | "licensed-hdr";
}

export interface ExternalParityIblResourceSet {
  readonly preset: ExternalParityEnvironmentPreset;
  readonly source: LinearHdrEnvironmentMapSource;
  readonly resources: EnvironmentMapResourceSet;
  readonly pmrem: ExternalParityPmrem;
  readonly brdfLut: ExternalParityBrdfLut;
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

export function createExternalParityIblResources(options: ExternalParityIblOptions): ExternalParityIblResourceSet {
  const source = createExternalParityGeneratedHdrEnvironmentMapSource(options.preset, options.width ?? 128, options.height ?? 64);
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
  const pmrem = createExternalParityPmrem(resources.base, {
    levels: 6,
    blurRadius: 3,
    textureLabel: `external-parity-${options.preset}-pmrem`
  });
  const brdfLut = createExternalParityBrdfLut(64);
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
