import {
  createEnvironmentMapResourceSet,
  decodeRgbeEnvironmentMap,
  generateRgba16fSpecularPrefilterMipLevels,
  type EnvironmentMapResourceSet,
  type EnvironmentToneMappingOperator,
  type LinearHdrEnvironmentMapSource,
  type RgbeEnvironmentMapSource
} from "../EnvironmentMapResources";
import type { EnvironmentLightingOptions } from "../ForwardPass";
import { Sampler } from "../Sampler";
import { Texture, type TextureCubeFace } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import {
  createCubemapPMREMShaderContract,
  generateCubemapPMREMResources,
  type CubemapPMREMResources,
  type CubemapPMREMShaderContract
} from "./environment/PMREMGenerator";

export type ProductionToneMappingOperator = "aces" | "filmic" | "linear" | "reinhard";

export interface ProductionToneMappingPolicy {
  readonly operator: ProductionToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly outputColorSpace: "srgb" | "linear";
}

export interface ProductionPbrHdrPipelineOptions {
  readonly id: string;
  readonly label: string;
  readonly intensity?: number;
  readonly backgroundIntensity?: number;
  readonly rotation?: number;
  readonly toneMapping?: Partial<ProductionToneMappingPolicy>;
  readonly specularLevels?: number;
  readonly cubemapFaceSize?: number;
  readonly cubemapMipCount?: number;
  readonly irradianceWidth?: number;
  readonly irradianceHeight?: number;
  readonly brdfLutSize?: number;
  readonly brdfLutSampleCount?: number;
  readonly specularSampleCount?: number;
  readonly cubemapSampleCount?: number;
}

export interface ProductionRadianceHDR {
  readonly width: number;
  readonly height: number;
  readonly rgbe: Uint8Array;
  readonly header: string;
  readonly format: "32-bit_rle_rgbe";
}

export interface ProductionPbrHdrPipeline {
  readonly id: string;
  readonly label: string;
  readonly radiance: ProductionRadianceHDR;
  readonly linear: LinearHdrEnvironmentMapSource;
  readonly resources: EnvironmentMapResourceSet;
  readonly environmentMipLevels: ReturnType<typeof generateRgba16fSpecularPrefilterMipLevels>;
  readonly cubemapPMREM: CubemapPMREMResources;
  readonly cubemapPMREMShaderContract: CubemapPMREMShaderContract;
  readonly toneMapping: ProductionToneMappingPolicy;
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly rotation: number;
  readonly diagnostics: {
    readonly realRadianceHdr: boolean;
    readonly environmentTextureEncoding: "rgba8-linear" | "rgba8-srgb" | "rgbe" | "rgba16f-linear";
    readonly environmentTextureFormat: "rgba8" | "rgba16f";
    readonly hdrPixelCount: number;
    readonly maxLinearValue: number;
    readonly diffuseIrradiance: boolean;
    readonly diffuseIrradianceModel: "cosine-weighted-hemisphere";
    readonly specularPrefilter: boolean;
    readonly specularPrefilterModel: "ggx-importance-sampled";
    readonly cubemapPMREM: boolean;
    readonly cubemapPMREMModel: "equirectangular-to-cubemap-ggx-importance-sampled-prefilter";
    readonly cubemapPMREMShaderSampling: "webgl2-sampler-cube";
    readonly cubemapPMREMShaderContract: "webgl2-sampler-cube-split-sum";
    readonly cubemapFaceSize: number;
    readonly cubemapMipCount: number;
    readonly brdfLut: boolean;
    readonly specularMipCount: number;
    readonly textureBytes: number;
  };
}

export interface ProductionEnvironmentLightingResources {
  readonly lighting: EnvironmentLightingOptions;
  readonly environmentTexture: Texture;
  readonly environmentCubeTexture: Texture;
  readonly brdfLutTexture: Texture;
  dispose(): void;
}

const DEFAULT_TONE_MAPPING: ProductionToneMappingPolicy = {
  operator: "filmic",
  exposure: 1,
  whitePoint: 11.2,
  outputColorSpace: "srgb"
};

const CUBE_TEXTURE_FACES: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export function parseProductionRadianceHDR(buffer: ArrayBuffer | Uint8Array): ProductionRadianceHDR {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const headerProbe = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.length, 4096)));
  const resolutionMatch = /(^|\n)-Y\s+(\d+)\s+\+X\s+(\d+)\s*\n/.exec(headerProbe);
  if (!/^#\?RADIANCE/m.test(headerProbe) && !/^#\?RGBE/m.test(headerProbe)) {
    throw new Error("Production HDR parser requires a Radiance/RGBE header.");
  }
  if (!/FORMAT=32-bit_rle_rgbe/.test(headerProbe)) {
    throw new Error("Production HDR parser requires FORMAT=32-bit_rle_rgbe.");
  }
  if (!resolutionMatch || resolutionMatch.index === undefined) {
    throw new Error("Production HDR parser could not find -Y +X resolution.");
  }
  const height = Number(resolutionMatch[2]);
  const width = Number(resolutionMatch[3]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Production HDR parser found invalid dimensions.");
  }
  const dataOffset = resolutionMatch.index + resolutionMatch[0].length;
  const rgbe = decodeRadianceRle(bytes.subarray(dataOffset), width, height);
  return {
    width,
    height,
    rgbe,
    header: headerProbe.slice(0, dataOffset),
    format: "32-bit_rle_rgbe"
  };
}

export function createProductionPbrHdrPipelineFromRadiance(
  buffer: ArrayBuffer | Uint8Array,
  options: ProductionPbrHdrPipelineOptions
): ProductionPbrHdrPipeline {
  const radiance = parseProductionRadianceHDR(buffer);
  const rgbeSource: RgbeEnvironmentMapSource = {
    width: radiance.width,
    height: radiance.height,
    data: radiance.rgbe
  };
  const linear = decodeRgbeEnvironmentMap(rgbeSource);
  const toneMapping = createProductionToneMappingPolicy(options.toneMapping);
  const resources = createEnvironmentMapResourceSet({ ...rgbeSource, encoding: "rgbe" }, {
    textureEncoding: "rgbe",
    outputColorSpace: toneMapping.outputColorSpace,
    exposure: toneMapping.exposure,
    toneMapping: environmentToneMappingOperator(toneMapping.operator),
    specularLevels: options.specularLevels ?? 9,
    specularBlurRadius: 3,
    irradianceWidth: options.irradianceWidth ?? 32,
    irradianceHeight: options.irradianceHeight ?? 16,
    irradianceBlurRadius: 12,
    brdfLutSize: options.brdfLutSize ?? 64,
    brdfLutSampleCount: options.brdfLutSampleCount
  });
  const environmentMipLevels = generateRgba16fSpecularPrefilterMipLevels(linear, {
    levels: resources.specularMipLevels.length,
    sampleCount: options.specularSampleCount ?? 16
  });
  const cubemapPMREM = generateCubemapPMREMResources(linear, {
    faceSize: options.cubemapFaceSize ?? 128,
    mipCount: options.cubemapMipCount,
    sampleCount: options.cubemapSampleCount ?? 32
  });
  const cubemapPMREMShaderContract = createCubemapPMREMShaderContract(cubemapPMREM);
  const textureBytes = environmentMipLevels.reduce((total, level) => total + level.data.byteLength, 0)
    + cubemapPMREM.diagnostics.totalByteLength
    + resources.brdfLut.data.byteLength
    + resources.diffuseIrradiance.data.byteLength;
  return {
    id: options.id,
    label: options.label,
    radiance,
    linear,
    resources,
    environmentMipLevels,
    cubemapPMREM,
    cubemapPMREMShaderContract,
    toneMapping,
    intensity: options.intensity ?? 1,
    backgroundIntensity: options.backgroundIntensity ?? 0.8,
    rotation: options.rotation ?? 0,
    diagnostics: {
      realRadianceHdr: true,
      environmentTextureEncoding: "rgba16f-linear",
      environmentTextureFormat: "rgba16f",
      hdrPixelCount: radiance.width * radiance.height,
      maxLinearValue: resources.diagnostics.maxLinearValue,
      diffuseIrradiance: resources.diffuseIrradiance.width > 0 && resources.diffuseIrradiance.height > 0,
      diffuseIrradianceModel: "cosine-weighted-hemisphere",
      specularPrefilter: resources.specularMipLevels.length >= 4,
      specularPrefilterModel: "ggx-importance-sampled",
      cubemapPMREM: cubemapPMREM.levels.length > 0 && cubemapPMREM.levels.every((level) => level.faces.length === 6),
      cubemapPMREMModel: "equirectangular-to-cubemap-ggx-importance-sampled-prefilter",
      cubemapPMREMShaderSampling: "webgl2-sampler-cube",
      cubemapPMREMShaderContract: "webgl2-sampler-cube-split-sum",
      cubemapFaceSize: cubemapPMREM.faceSize,
      cubemapMipCount: cubemapPMREM.mipCount,
      brdfLut: resources.brdfLut.width > 0 && resources.brdfLut.height > 0,
      specularMipCount: resources.specularMipLevels.length,
      textureBytes
    }
  };
}

export function createProductionEnvironmentLightingResources(
  pipeline: ProductionPbrHdrPipeline
): ProductionEnvironmentLightingResources {
  const environmentTexture = new Texture({
    width: pipeline.resources.base.width,
    height: pipeline.resources.base.height,
    format: "rgba16f",
    colorSpace: "linear",
    label: `production-runtime-${pipeline.id}-pmrem`,
    mipLevels: pipeline.environmentMipLevels
  });
  const brdfLutTexture = new Texture({
    width: pipeline.resources.brdfLut.width,
    height: pipeline.resources.brdfLut.height,
    colorSpace: "linear",
    label: `production-runtime-${pipeline.id}-brdf-lut`,
    data: pipeline.resources.brdfLut.data
  });
  const environmentCubeTexture = new Texture({
    width: pipeline.cubemapPMREM.faceSize,
    height: pipeline.cubemapPMREM.faceSize,
    dimension: "cube",
    format: "rgba16f",
    colorSpace: "linear",
    label: `production-runtime-${pipeline.id}-cubemap-pmrem`,
    cubeFaces: CUBE_TEXTURE_FACES.map((face) => ({
      face,
      mipLevels: pipeline.cubemapPMREM.levels.map((level) => {
        const faceLevel = level.faces.find((candidate) => candidate.face === face);
        if (!faceLevel) {
          throw new Error(`Missing cubemap PMREM face ${face} at mip ${level.mip}`);
        }
        return {
          width: faceLevel.width,
          height: faceLevel.height,
          data: faceLevel.data
        };
      })
    }))
  });
  return {
    environmentTexture,
    environmentCubeTexture,
    brdfLutTexture,
    lighting: {
      color: [1, 1, 1],
      intensity: 0.08,
      proceduralMap: {
        skyColor: [0.2, 0.24, 0.32],
        horizonColor: [0.22, 0.2, 0.18],
        groundColor: [0.03, 0.035, 0.045],
        specularColor: [1, 1, 1],
        intensity: 0.06,
        specularIntensity: 0.1
      },
      environmentMapTexture: new TextureBinding({
        name: "u_environmentMapTexture",
        texture: environmentTexture,
        sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
        expectedColorSpace: "linear"
      }),
      environmentCubeMapTexture: new TextureBinding({
        name: "u_environmentCubeMapTexture",
        texture: environmentCubeTexture,
        sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        expectedColorSpace: "linear"
      }),
      environmentMapIntensity: pipeline.intensity,
      environmentMapSpecularIntensity: pipeline.intensity * 0.38,
      environmentMapRotation: pipeline.rotation,
      environmentMapMipCount: pipeline.cubemapPMREM.mipCount,
      environmentMapEncoding: "linear",
      environmentBrdfLutTexture: new TextureBinding({
        name: "u_environmentBrdfLutTexture",
        texture: brdfLutTexture,
        sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        expectedColorSpace: "linear"
      })
    },
    dispose: () => {
      environmentTexture.dispose();
      environmentCubeTexture.dispose();
      brdfLutTexture.dispose();
    }
  };
}

export function createProductionToneMappingPolicy(overrides: Partial<ProductionToneMappingPolicy> = {}): ProductionToneMappingPolicy {
  const policy = { ...DEFAULT_TONE_MAPPING, ...overrides };
  if (!Number.isFinite(policy.exposure) || policy.exposure < 0) {
    throw new RangeError("Production tone mapping exposure must be finite and non-negative.");
  }
  if (!Number.isFinite(policy.whitePoint) || policy.whitePoint <= 0) {
    throw new RangeError("Production tone mapping whitePoint must be finite and positive.");
  }
  return policy;
}

function environmentToneMappingOperator(operator: ProductionToneMappingOperator): EnvironmentToneMappingOperator {
  return operator === "linear" ? "linear" : "reinhard";
}

function decodeRadianceRle(data: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    if (offset + 4 > data.length) {
      throw new Error(`Production HDR scanline ${y} is truncated.`);
    }
    const b0 = data[offset] ?? 0;
    const b1 = data[offset + 1] ?? 0;
    const b2 = data[offset + 2] ?? 0;
    const b3 = data[offset + 3] ?? 0;
    if (width >= 8 && width < 32768 && b0 === 2 && b1 === 2 && (b2 & 0x80) === 0) {
      const scanlineWidth = (b2 << 8) | b3;
      if (scanlineWidth !== width) {
        throw new Error(`Production HDR scanline ${y} width ${scanlineWidth} does not match ${width}.`);
      }
      offset += 4;
      const scanline = new Uint8Array(width * 4);
      for (let channel = 0; channel < 4; channel += 1) {
        let x = 0;
        while (x < width) {
          const count = data[offset++];
          if (count === undefined) {
            throw new Error(`Production HDR scanline ${y} channel ${channel} is truncated.`);
          }
          if (count === 0) {
            throw new Error(`Production HDR scanline ${y} channel ${channel} has invalid zero run length.`);
          }
          if (count > 128) {
            const runLength = count - 128;
            if (x + runLength > width) {
              throw new Error(`Production HDR scanline ${y} channel ${channel} run exceeds width ${width}.`);
            }
            const value = data[offset++];
            if (value === undefined) {
              throw new Error(`Production HDR scanline ${y} channel ${channel} run is truncated.`);
            }
            for (let index = 0; index < runLength; index += 1) {
              scanline[(x + index) * 4 + channel] = value;
            }
            x += runLength;
          } else {
            if (x + count > width) {
              throw new Error(`Production HDR scanline ${y} channel ${channel} literal exceeds width ${width}.`);
            }
            for (let index = 0; index < count; index += 1) {
              const value = data[offset++];
              if (value === undefined) {
                throw new Error(`Production HDR scanline ${y} channel ${channel} literal is truncated.`);
              }
              scanline[(x + index) * 4 + channel] = value;
            }
            x += count;
          }
        }
      }
      output.set(scanline, y * width * 4);
    } else {
      const byteLength = width * 4;
      if (offset + byteLength > data.length) {
        throw new Error(`Production HDR scanline ${y} is truncated.`);
      }
      output.set(data.subarray(offset, offset + byteLength), y * byteLength);
      offset += byteLength;
    }
  }
  return output;
}
