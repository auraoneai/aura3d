import { createEnvironmentMapResourceSet, type EnvironmentMapResourceSet } from "./EnvironmentMapResources";
import { bloomPixels, fxaaPixels, toneMapPixels, type PostProcessColorSpace, type ToneMappingOperator } from "./PostProcessPass";
import { Sampler } from "./Sampler";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import type { EnvironmentLightingOptions } from "./ForwardPass";

export type ExternalParityRenderPresetFeature =
  | "color-management"
  | "tone-mapping"
  | "exposure"
  | "pbr"
  | "bounded-pbr"
  | "environment-reflections"
  | "directional-shadows"
  | "contact-shadows"
  | "postprocess-bloom"
  | "postprocess-fxaa"
  | "depth-textures"
  | "lod"
  | "gpu-timing"
  | "hdr";

export interface ExternalParityRenderPresetFeatureStatus {
  readonly feature: ExternalParityRenderPresetFeature;
  readonly state: "active" | "blocked" | "unsupported";
  readonly evidence?: string;
  readonly reason?: string;
}

export interface ExternalParityRenderPresetEvidence {
  readonly presetId: "aura3d-external-parity-visual-quality-preset";
  readonly presetVersion: 1;
  readonly exampleId: string;
  readonly screenshotPath: string;
  readonly colorManagement: {
    readonly inputColorSpace: PostProcessColorSpace;
    readonly outputColorSpace: PostProcessColorSpace;
    readonly toneMapper: ToneMappingOperator | "bounded-direct";
    readonly exposure: number;
    readonly whitePoint: number;
  };
  readonly activeFeatures: readonly ExternalParityRenderPresetFeature[];
  readonly blockedFeatures: readonly ExternalParityRenderPresetFeatureStatus[];
  readonly features: readonly ExternalParityRenderPresetFeatureStatus[];
}

export type ExternalParityEnvironmentPreset =
  | "studio"
  | "softbox"
  | "inspection"
  | "daylight"
  | "exhibit"
  | "evening"
  | "gameplay";

export interface ExternalParityEnvironmentLightingBundle {
  readonly presetId: "aura3d-external-parity-visual-quality-preset";
  readonly manifestPath: "fixtures/environment-corpus/manifest.json";
  readonly preset: ExternalParityEnvironmentPreset;
  readonly lighting: EnvironmentLightingOptions;
  readonly resources: EnvironmentMapResourceSet["diagnostics"] & {
    readonly environmentTextureLabel: string;
    readonly brdfLutTextureLabel: string;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly resourceSet: "generated-local-linear-hdr-environment";
    readonly validation: {
      readonly environmentTexture: boolean;
      readonly brdfLutTexture: boolean;
      readonly specularMipLevels: boolean;
      readonly diffuseIrradiance: boolean;
    };
  };
}

export interface ExternalParityLdrPostprocessSummary {
  readonly source: "webgl2-backbuffer-readback";
  readonly path: "ExternalParityRenderPreset.toneMapPixels.bloomPixels.fxaaPixels";
  readonly width: number;
  readonly height: number;
  readonly inputNonDarkPixels: number;
  readonly outputNonDarkPixels: number;
  readonly inputColorBuckets: number;
  readonly outputColorBuckets: number;
  readonly toneMapper: ToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly outputColorSpace: PostProcessColorSpace;
  readonly colorCalibrationMonotonic: boolean;
  readonly bloomBrightPixelCount: number;
  readonly bloomBrightEnergy: number;
  readonly bloomMaxNeighborBoost: number;
  readonly fxaaEdgePixels: number;
  readonly changedPixels: number;
}

export interface ExternalParityDirectionalShadowEvidence {
  readonly mode: "bounded-directional-shadow-map" | "renderer-owned-directional-shadow-map";
  readonly presetId: "aura3d-external-parity-visual-quality-preset";
  readonly exampleId: string;
  readonly cascadeCount: number;
  readonly mapSize: number;
  readonly bias: number;
  readonly pcfSamples: number;
  readonly lightDirection: readonly [number, number, number];
  readonly casterCount: number;
  readonly receiverCount: number;
  readonly stableTexelSnapping: true;
  readonly visibleReceiverDarkening: boolean;
  readonly productionShadowSamplingClaimed: boolean;
  readonly knownLimit: "directional-shadow-map-fit-and-visible-receiver-evidence-without-production-forward-shadow-sampling" | "renderer-owned-forward-shadow-map-sampling-evidence";
}

export interface ExternalParityReadbackDevice {
  readPixels(x: number, y: number, width: number, height: number): Uint8Array;
}

const externalParityEnvironmentLightingCache = new Map<ExternalParityEnvironmentPreset, ExternalParityEnvironmentLightingBundle>();

export interface ExternalParityRenderPresetEvidenceOptions {
  readonly exampleId: string;
  readonly screenshotPath: string;
  readonly toneMapper?: ExternalParityRenderPresetEvidence["colorManagement"]["toneMapper"];
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly outputColorSpace?: PostProcessColorSpace;
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly features: readonly ExternalParityRenderPresetFeatureStatus[];
}

export function createExternalParityEnvironmentLighting(preset: ExternalParityEnvironmentPreset): ExternalParityEnvironmentLightingBundle {
  const cached = externalParityEnvironmentLightingCache.get(preset);
  if (cached) return cached;
  const descriptor = externalParityEnvironmentDescriptor(preset);
  const source = createExternalParityGeneratedHdrEnvironmentMapSource(preset, 128, 64);
  const resources = createEnvironmentMapResourceSet({
    ...source,
    encoding: "linear-hdr"
  }, {
    outputColorSpace: "srgb",
    exposure: descriptor.hdrExposure,
    toneMapping: "reinhard",
    specularLevels: 5,
    specularBlurRadius: 3,
    irradianceWidth: 16,
    irradianceHeight: 8,
    irradianceBlurRadius: 8,
    brdfLutSize: 32
  });
  const environmentTexture = new Texture({
    width: resources.base.width,
    height: resources.base.height,
    colorSpace: "srgb",
    label: `external-parity-${preset}-generated-environment-map`,
    mipLevels: resources.specularMipLevels
  });
  const brdfLutTexture = new Texture({
    width: resources.brdfLut.width,
    height: resources.brdfLut.height,
    colorSpace: "linear",
    label: `external-parity-${preset}-brdf-lut`,
    data: resources.brdfLut.data
  });
  const environmentMapTexture = new TextureBinding({
    name: "u_environmentMapTexture",
    texture: environmentTexture,
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
    expectedColorSpace: "srgb",
    required: true
  });
  const environmentBrdfLutTexture = new TextureBinding({
    name: "u_environmentBrdfLutTexture",
    texture: brdfLutTexture,
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
    expectedColorSpace: "linear",
    required: true
  });
  const environmentValidation = environmentMapTexture.validate();
  const brdfValidation = environmentBrdfLutTexture.validate();
  const bundle: ExternalParityEnvironmentLightingBundle = {
    presetId: "aura3d-external-parity-visual-quality-preset",
    manifestPath: "fixtures/environment-corpus/manifest.json",
    preset,
    lighting: {
      color: descriptor.ambientColor,
      intensity: descriptor.ambientIntensity,
      proceduralMap: {
        skyColor: descriptor.skyColor,
        horizonColor: descriptor.horizonColor,
        groundColor: descriptor.groundColor,
        specularColor: descriptor.specularColor,
        intensity: descriptor.environmentMapIntensity,
        specularIntensity: descriptor.environmentSpecularIntensity
      },
      environmentMapTexture,
      environmentMapIntensity: descriptor.environmentTextureIntensity,
      environmentMapSpecularIntensity: descriptor.environmentTextureSpecularIntensity,
      environmentMapRotation: descriptor.rotation,
      environmentMapMipCount: resources.specularMipLevels.length,
      environmentBrdfLutTexture
    },
    resources: {
      ...resources.diagnostics,
      environmentTextureLabel: environmentTexture.label,
      brdfLutTextureLabel: brdfLutTexture.label,
      sourceWidth: source.width,
      sourceHeight: source.height,
      resourceSet: "generated-local-linear-hdr-environment",
      validation: {
        environmentTexture: environmentValidation.ok,
        brdfLutTexture: brdfValidation.ok,
        specularMipLevels: resources.specularMipLevels.length >= 4,
        diffuseIrradiance: resources.diffuseIrradiance.width > 0 && resources.diffuseIrradiance.height > 0
      }
    }
  };
  externalParityEnvironmentLightingCache.set(preset, bundle);
  return bundle;
}

export function createExternalParityGeneratedHdrEnvironmentMapSource(
  preset: ExternalParityEnvironmentPreset,
  width = 128,
  height = 64
): { readonly width: number; readonly height: number; readonly data: Float32Array } {
  if (!Number.isInteger(width) || width < 8 || !Number.isInteger(height) || height < 4) {
    throw new RangeError("ExternalParity generated HDR environment map dimensions must be at least 8x4.");
  }
  const descriptor = externalParityEnvironmentDescriptor(preset);
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / Math.max(1, height - 1);
    const skyMix = 1 - vertical;
    const horizonMix = Math.max(0, 1 - Math.abs(vertical - 0.52) * 3.2);
    const groundMix = Math.max(0, (vertical - 0.52) / 0.48);
    const denominator = skyMix + horizonMix + groundMix + 0.001;
    for (let x = 0; x < width; x += 1) {
      const horizontal = x / Math.max(1, width - 1);
      const stripe = 0.5 + 0.5 * Math.sin(horizontal * Math.PI * 2 + descriptor.rotation * Math.PI * 2);
      const softbox = Math.pow(Math.max(0, 1 - Math.abs(horizontal - descriptor.highlightU) * 4.8), 4)
        * Math.pow(Math.max(0, 1 - Math.abs(vertical - descriptor.highlightV) * 6.2), 3);
      const r = descriptor.skyColor[0] * skyMix + descriptor.horizonColor[0] * horizonMix + descriptor.groundColor[0] * groundMix;
      const g = descriptor.skyColor[1] * skyMix + descriptor.horizonColor[1] * horizonMix + descriptor.groundColor[1] * groundMix;
      const b = descriptor.skyColor[2] * skyMix + descriptor.horizonColor[2] * horizonMix + descriptor.groundColor[2] * groundMix;
      const highlight = softbox * descriptor.hdrHighlightIntensity;
      const index = (y * width + x) * 4;
      data[index] = Math.max(0, (r + descriptor.specularColor[0] * highlight + stripe * descriptor.textureVariation) / denominator);
      data[index + 1] = Math.max(0, (g + descriptor.specularColor[1] * highlight + stripe * descriptor.textureVariation) / denominator);
      data[index + 2] = Math.max(0, (b + descriptor.specularColor[2] * highlight + stripe * descriptor.textureVariation) / denominator);
      data[index + 3] = 1;
    }
  }
  return { width, height, data };
}

export function createExternalParityGeneratedEnvironmentMapSource(
  preset: ExternalParityEnvironmentPreset,
  width = 128,
  height = 64
): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  if (!Number.isInteger(width) || width < 8 || !Number.isInteger(height) || height < 4) {
    throw new RangeError("ExternalParity generated environment map dimensions must be at least 8x4.");
  }
  const descriptor = externalParityEnvironmentDescriptor(preset);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / Math.max(1, height - 1);
    const skyMix = 1 - vertical;
    const horizonMix = Math.max(0, 1 - Math.abs(vertical - 0.52) * 3.2);
    const groundMix = Math.max(0, (vertical - 0.52) / 0.48);
    for (let x = 0; x < width; x += 1) {
      const horizontal = x / Math.max(1, width - 1);
      const stripe = 0.5 + 0.5 * Math.sin(horizontal * Math.PI * 2 + descriptor.rotation * Math.PI * 2);
      const softbox = Math.pow(Math.max(0, 1 - Math.abs(horizontal - descriptor.highlightU) * 4.8), 4)
        * Math.pow(Math.max(0, 1 - Math.abs(vertical - descriptor.highlightV) * 6.2), 3);
      const r = descriptor.skyColor[0] * skyMix + descriptor.horizonColor[0] * horizonMix + descriptor.groundColor[0] * groundMix;
      const g = descriptor.skyColor[1] * skyMix + descriptor.horizonColor[1] * horizonMix + descriptor.groundColor[1] * groundMix;
      const b = descriptor.skyColor[2] * skyMix + descriptor.horizonColor[2] * horizonMix + descriptor.groundColor[2] * groundMix;
      const index = (y * width + x) * 4;
      data[index] = toByte((r + descriptor.specularColor[0] * softbox + stripe * descriptor.textureVariation) / (skyMix + horizonMix + groundMix + 0.001));
      data[index + 1] = toByte((g + descriptor.specularColor[1] * softbox + stripe * descriptor.textureVariation) / (skyMix + horizonMix + groundMix + 0.001));
      data[index + 2] = toByte((b + descriptor.specularColor[2] * softbox + stripe * descriptor.textureVariation) / (skyMix + horizonMix + groundMix + 0.001));
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

export function createExternalParityFlagshipRenderPresetEvidence(options: {
  readonly exampleId: string;
  readonly screenshotPath: string;
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly productionPbrEvidence?: boolean;
  readonly directionalShadowEvidence?: boolean;
  readonly productionShadowSamplingEvidence?: boolean;
  readonly postprocessEvidence?: boolean;
  readonly depthTextureEvidence?: boolean;
  readonly hdrRenderTargetEvidence?: boolean;
  readonly lodEvidence?: boolean;
}): ExternalParityRenderPresetEvidence {
  const postprocessPathEvidence = options.hdrRenderTargetEvidence
    ? "renderer-owned HDR render-target postprocess path"
    : "shared ExternalParity LDR readback path";
  return createExternalParityRenderPresetEvidence({
    exampleId: options.exampleId,
    screenshotPath: options.screenshotPath,
    toneMapper: "reinhard",
    exposure: options.exposure ?? 1,
    whitePoint: options.whitePoint ?? 1,
    features: [
      externalParityActiveFeature("color-management", "ExternalParity preset records linear input and sRGB framebuffer output for this browser scene."),
      externalParityActiveFeature(
        "tone-mapping",
        options.hdrRenderTargetEvidence
          ? "ExternalParity preset publishes renderer-owned HDR render-target tone mapping evidence for this real scene."
          : "ExternalParity preset applies bounded Reinhard LDR postprocess readback metrics for this real scene."
      ),
      externalParityActiveFeature("exposure", "ExternalParity preset exposes finite exposure and white-point values in runtime state."),
      options.productionPbrEvidence
        ? externalParityActiveFeature("pbr", "Scene publishes root renderer material/shader PBR evidence with lit material response and environment reflection metrics.")
        : externalParityActiveFeature("bounded-pbr", "Scene uses Aura3D lit PBR materials and WebGL2 shader lighting while full external physical PBR parity remains separately gated."),
      externalParityActiveFeature("environment-reflections", "Scene uses generated local environment map, specular mip resources, diffuse irradiance, and BRDF LUT bindings."),
      options.directionalShadowEvidence
        ? externalParityActiveFeature(
            "directional-shadows",
            options.productionShadowSamplingEvidence
              ? "Scene publishes renderer-owned directional shadow-map sampling evidence in the forward path."
              : "Scene publishes visible directional-shadow-map evidence while production sampling remains separately gated."
          )
        : externalParityBlockedFeature("directional-shadows", "Flagship scene still uses bounded contact-shadow/proxy evidence; production shadow maps are not claimed."),
      externalParityActiveFeature(
        "contact-shadows",
        options.productionShadowSamplingEvidence
          ? "Scene may publish contact-shadow helper evidence as an auxiliary cue; renderer-owned shadow-map sampling is the primary shadow path."
          : "Scene publishes visible contact-shadow/proxy evidence while shadow maps remain blocked."
      ),
      options.postprocessEvidence
        ? externalParityActiveFeature("postprocess-bloom", `Scene runs bloom through the ${postprocessPathEvidence} on real scene pixels.`)
        : externalParityBlockedFeature("postprocess-bloom", "Postprocess readback evidence was not available for this scene."),
      options.postprocessEvidence
        ? externalParityActiveFeature("postprocess-fxaa", `Scene runs FXAA through the ${postprocessPathEvidence} on real scene pixels.`)
        : externalParityBlockedFeature("postprocess-fxaa", "FXAA readback evidence was not available for this scene."),
      options.depthTextureEvidence
        ? externalParityActiveFeature("depth-textures", "Scene publishes renderer-owned sampleable depth texture evidence for depth-aware postprocess.")
        : externalParityBlockedFeature("depth-textures", "Flagship scene did not publish sampleable depth texture evidence for depth-aware postprocess."),
      options.lodEvidence
        ? externalParityActiveFeature("lod", "Scene reports real LOD selection metrics for render items.")
        : externalParityBlockedFeature("lod", "This scene does not publish real LOD selection evidence."),
      externalParityBlockedFeature("gpu-timing", "GPU timer query evidence is not required for this ExternalParity flagship preset; CPU fallback timing is reported."),
      options.hdrRenderTargetEvidence
        ? externalParityActiveFeature("hdr", "Scene publishes renderer-owned HDR render-target evidence with tone-mapped presentation.")
        : externalParityBlockedFeature("hdr", "Flagship scene did not publish renderer-owned HDR render-target evidence.")
    ]
  });
}

export function createExternalParityDirectionalShadowEvidence(options: {
  readonly exampleId: string;
  readonly casterCount: number;
  readonly receiverCount: number;
  readonly visibleReceiverDarkening: boolean;
  readonly cascadeCount?: number;
  readonly mapSize?: number;
  readonly bias?: number;
  readonly pcfSamples?: number;
  readonly lightDirection?: readonly [number, number, number];
  readonly productionShadowSamplingClaimed?: boolean;
}): ExternalParityDirectionalShadowEvidence {
  const productionShadowSamplingClaimed = options.productionShadowSamplingClaimed === true;
  return {
    mode: productionShadowSamplingClaimed ? "renderer-owned-directional-shadow-map" : "bounded-directional-shadow-map",
    presetId: "aura3d-external-parity-visual-quality-preset",
    exampleId: options.exampleId,
    cascadeCount: options.cascadeCount ?? 3,
    mapSize: options.mapSize ?? 512,
    bias: Number((options.bias ?? 0.003).toFixed(5)),
    pcfSamples: options.pcfSamples ?? 9,
    lightDirection: options.lightDirection ?? [-0.42, -0.82, -0.38],
    casterCount: Math.max(0, Math.floor(options.casterCount)),
    receiverCount: Math.max(0, Math.floor(options.receiverCount)),
    stableTexelSnapping: true,
    visibleReceiverDarkening: options.visibleReceiverDarkening,
    productionShadowSamplingClaimed,
    knownLimit: productionShadowSamplingClaimed
      ? "renderer-owned-forward-shadow-map-sampling-evidence"
      : "directional-shadow-map-fit-and-visible-receiver-evidence-without-production-forward-shadow-sampling"
  };
}

export function sampleExternalParityLdrPostprocessReadback(options: {
  readonly device: ExternalParityReadbackDevice;
  readonly framebufferWidth: number;
  readonly framebufferHeight: number;
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly toneMapper?: ToneMappingOperator;
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly outputColorSpace?: PostProcessColorSpace;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}): ExternalParityLdrPostprocessSummary {
  const width = Math.max(8, Math.min(options.maxWidth ?? 96, options.framebufferWidth));
  const height = Math.max(8, Math.min(options.maxHeight ?? 54, options.framebufferHeight));
  const x = Math.max(0, Math.floor(options.framebufferWidth / 2 - width / 2));
  const y = Math.max(0, Math.floor(options.framebufferHeight / 2 - height / 2));
  const input = options.device.readPixels(x, y, width, height);
  const exposure = options.exposure ?? 1;
  const whitePoint = options.whitePoint ?? 1;
  const toneMapper = options.toneMapper ?? "reinhard";
  const inputColorSpace = options.inputColorSpace ?? "srgb";
  const outputColorSpace = options.outputColorSpace ?? "srgb";
  const toneMapped = toneMapPixels(input, width, height, {
    exposure,
    whitePoint,
    gamma: 2.2,
    operator: toneMapper,
    inputColorSpace,
    outputColorSpace
  });
  const bloomed = bloomPixels(toneMapped.pixels, width, height, { threshold: 0.62, intensity: 0.28, radius: 1 });
  const fxaa = fxaaPixels(bloomed.pixels, width, height, { edgeThreshold: 0.08, subpixelBlend: 0.55 });
  return {
    source: "webgl2-backbuffer-readback",
    path: "ExternalParityRenderPreset.toneMapPixels.bloomPixels.fxaaPixels",
    width,
    height,
    inputNonDarkPixels: countNonDarkPixels(input),
    outputNonDarkPixels: countNonDarkPixels(fxaa.pixels),
    inputColorBuckets: countColorBuckets(input),
    outputColorBuckets: countColorBuckets(fxaa.pixels),
    toneMapper,
    exposure: Number(exposure.toFixed(4)),
    whitePoint: Number(whitePoint.toFixed(4)),
    inputColorSpace,
    outputColorSpace,
    colorCalibrationMonotonic: toneMapped.calibration.monotonic,
    bloomBrightPixelCount: bloomed.brightPixelCount,
    bloomBrightEnergy: Number(bloomed.brightEnergy.toFixed(4)),
    bloomMaxNeighborBoost: Number(bloomed.maxNeighborBoost.toFixed(4)),
    fxaaEdgePixels: countMaskPixels(fxaa.edgeMask),
    changedPixels: countChangedPixels(input, fxaa.pixels)
  };
}

export function createExternalParityRenderPresetEvidence(options: ExternalParityRenderPresetEvidenceOptions): ExternalParityRenderPresetEvidence {
  if (!options.exampleId.trim()) {
    throw new Error("ExternalParity render preset evidence requires an example id.");
  }
  if (!options.screenshotPath.trim()) {
    throw new Error("ExternalParity render preset evidence requires a screenshot path.");
  }
  const features = normalizeFeatureStatuses(options.features);
  return {
    presetId: "aura3d-external-parity-visual-quality-preset",
    presetVersion: 1,
    exampleId: options.exampleId,
    screenshotPath: options.screenshotPath,
    colorManagement: {
      inputColorSpace: options.inputColorSpace ?? "linear",
      outputColorSpace: options.outputColorSpace ?? "srgb",
      toneMapper: options.toneMapper ?? "bounded-direct",
      exposure: finitePositive(options.exposure ?? 1, "exposure"),
      whitePoint: finitePositive(options.whitePoint ?? 1, "whitePoint")
    },
    activeFeatures: features.filter((feature) => feature.state === "active").map((feature) => feature.feature),
    blockedFeatures: features.filter((feature) => feature.state !== "active"),
    features
  };
}

function externalParityEnvironmentDescriptor(preset: ExternalParityEnvironmentPreset): {
  readonly ambientColor: readonly [number, number, number];
  readonly ambientIntensity: number;
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly environmentMapIntensity: number;
  readonly environmentSpecularIntensity: number;
  readonly environmentTextureIntensity: number;
  readonly environmentTextureSpecularIntensity: number;
  readonly rotation: number;
  readonly highlightU: number;
  readonly highlightV: number;
  readonly textureVariation: number;
  readonly hdrHighlightIntensity: number;
  readonly hdrExposure: number;
} {
  switch (preset) {
    case "softbox":
      return {
        ambientColor: [0.48, 0.52, 0.58],
        ambientIntensity: 0.18,
        skyColor: [0.72, 0.82, 0.94],
        horizonColor: [0.94, 0.88, 0.78],
        groundColor: [0.18, 0.2, 0.22],
        specularColor: [1, 0.95, 0.84],
        environmentMapIntensity: 0.52,
        environmentSpecularIntensity: 0.9,
        environmentTextureIntensity: 0.42,
        environmentTextureSpecularIntensity: 0.95,
        rotation: 0.08,
        highlightU: 0.28,
        highlightV: 0.36,
        textureVariation: 0.035,
        hdrHighlightIntensity: 2.8,
        hdrExposure: 0.86
      };
    case "inspection":
      return {
        ambientColor: [0.42, 0.5, 0.62],
        ambientIntensity: 0.16,
        skyColor: [0.48, 0.7, 0.96],
        horizonColor: [0.78, 0.84, 0.88],
        groundColor: [0.12, 0.13, 0.15],
        specularColor: [0.72, 0.9, 1],
        environmentMapIntensity: 0.55,
        environmentSpecularIntensity: 0.82,
        environmentTextureIntensity: 0.46,
        environmentTextureSpecularIntensity: 0.84,
        rotation: -0.04,
        highlightU: 0.64,
        highlightV: 0.42,
        textureVariation: 0.028,
        hdrHighlightIntensity: 2.35,
        hdrExposure: 0.9
      };
    case "daylight":
      return {
        ambientColor: [0.5, 0.56, 0.62],
        ambientIntensity: 0.2,
        skyColor: [0.42, 0.66, 0.92],
        horizonColor: [0.88, 0.82, 0.68],
        groundColor: [0.26, 0.25, 0.22],
        specularColor: [1, 0.9, 0.66],
        environmentMapIntensity: 0.48,
        environmentSpecularIntensity: 0.7,
        environmentTextureIntensity: 0.4,
        environmentTextureSpecularIntensity: 0.72,
        rotation: 0.12,
        highlightU: 0.18,
        highlightV: 0.32,
        textureVariation: 0.024,
        hdrHighlightIntensity: 3.15,
        hdrExposure: 0.82
      };
    case "exhibit":
      return {
        ambientColor: [0.34, 0.38, 0.44],
        ambientIntensity: 0.16,
        skyColor: [0.12, 0.16, 0.22],
        horizonColor: [0.78, 0.64, 0.42],
        groundColor: [0.08, 0.08, 0.09],
        specularColor: [1, 0.72, 0.36],
        environmentMapIntensity: 0.42,
        environmentSpecularIntensity: 0.76,
        environmentTextureIntensity: 0.38,
        environmentTextureSpecularIntensity: 0.8,
        rotation: 0.2,
        highlightU: 0.48,
        highlightV: 0.3,
        textureVariation: 0.02,
        hdrHighlightIntensity: 2.65,
        hdrExposure: 0.88
      };
    case "evening":
      return {
        ambientColor: [0.28, 0.32, 0.48],
        ambientIntensity: 0.18,
        skyColor: [0.16, 0.2, 0.42],
        horizonColor: [0.95, 0.48, 0.22],
        groundColor: [0.09, 0.08, 0.12],
        specularColor: [1, 0.54, 0.3],
        environmentMapIntensity: 0.44,
        environmentSpecularIntensity: 0.78,
        environmentTextureIntensity: 0.36,
        environmentTextureSpecularIntensity: 0.82,
        rotation: -0.14,
        highlightU: 0.72,
        highlightV: 0.38,
        textureVariation: 0.03,
        hdrHighlightIntensity: 3,
        hdrExposure: 0.84
      };
    case "gameplay":
      return {
        ambientColor: [0.34, 0.42, 0.5],
        ambientIntensity: 0.18,
        skyColor: [0.16, 0.38, 0.6],
        horizonColor: [0.1, 0.72, 0.7],
        groundColor: [0.08, 0.12, 0.18],
        specularColor: [0.2, 0.96, 1],
        environmentMapIntensity: 0.46,
        environmentSpecularIntensity: 0.74,
        environmentTextureIntensity: 0.34,
        environmentTextureSpecularIntensity: 0.76,
        rotation: 0.32,
        highlightU: 0.54,
        highlightV: 0.34,
        textureVariation: 0.04,
        hdrHighlightIntensity: 2.5,
        hdrExposure: 0.9
      };
    case "studio":
      return {
        ambientColor: [0.44, 0.48, 0.54],
        ambientIntensity: 0.18,
        skyColor: [0.54, 0.66, 0.86],
        horizonColor: [0.9, 0.82, 0.68],
        groundColor: [0.12, 0.14, 0.16],
        specularColor: [1, 0.92, 0.78],
        environmentMapIntensity: 0.5,
        environmentSpecularIntensity: 0.86,
        environmentTextureIntensity: 0.44,
        environmentTextureSpecularIntensity: 0.92,
        rotation: 0.06,
        highlightU: 0.36,
        highlightV: 0.34,
        textureVariation: 0.032,
        hdrHighlightIntensity: 2.7,
        hdrExposure: 0.86
      };
  }
}

function countNonDarkPixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) > 10 || (pixels[index + 1] ?? 0) > 10 || (pixels[index + 2] ?? 0) > 10) count += 1;
  }
  return count;
}

function countColorBuckets(pixels: Uint8Array): number {
  const buckets = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    const r = (pixels[index] ?? 0) >> 5;
    const g = (pixels[index + 1] ?? 0) >> 5;
    const b = (pixels[index + 2] ?? 0) >> 5;
    if (r !== 0 || g !== 0 || b !== 0) buckets.add(`${r}:${g}:${b}`);
  }
  return buckets.size;
}

function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) {
    if (value > 0) count += 1;
  }
  return count;
}

function countChangedPixels(before: Uint8Array, after: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < before.length; index += 4) {
    const delta = Math.abs((before[index] ?? 0) - (after[index] ?? 0))
      + Math.abs((before[index + 1] ?? 0) - (after[index + 1] ?? 0))
      + Math.abs((before[index + 2] ?? 0) - (after[index + 2] ?? 0));
    if (delta > 8) count += 1;
  }
  return count;
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function externalParityActiveFeature(feature: ExternalParityRenderPresetFeature, evidence: string): ExternalParityRenderPresetFeatureStatus {
  return {
    feature,
    state: "active",
    evidence: requireMessage(evidence, "active feature evidence")
  };
}

export function externalParityBlockedFeature(feature: ExternalParityRenderPresetFeature, reason: string): ExternalParityRenderPresetFeatureStatus {
  return {
    feature,
    state: "blocked",
    reason: requireMessage(reason, "blocked feature reason")
  };
}

export function externalParityUnsupportedFeature(feature: ExternalParityRenderPresetFeature, reason: string): ExternalParityRenderPresetFeatureStatus {
  return {
    feature,
    state: "unsupported",
    reason: requireMessage(reason, "unsupported feature reason")
  };
}

function normalizeFeatureStatuses(features: readonly ExternalParityRenderPresetFeatureStatus[]): readonly ExternalParityRenderPresetFeatureStatus[] {
  const seen = new Set<ExternalParityRenderPresetFeature>();
  return features.map((feature) => {
    if (seen.has(feature.feature)) {
      throw new Error(`Duplicate ExternalParity render preset feature: ${feature.feature}`);
    }
    seen.add(feature.feature);
    if (feature.state === "active") {
      return externalParityActiveFeature(feature.feature, feature.evidence ?? "");
    }
    if (feature.state === "blocked") {
      return externalParityBlockedFeature(feature.feature, feature.reason ?? "");
    }
    return externalParityUnsupportedFeature(feature.feature, feature.reason ?? "");
  });
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`ExternalParity render preset ${label} must be a finite positive number.`);
  }
  return Number(value.toFixed(4));
}

function requireMessage(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`ExternalParity render preset ${label} is required.`);
  }
  return trimmed;
}
