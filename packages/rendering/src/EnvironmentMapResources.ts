import { type TextureMipLevelDescriptor } from "./Texture";
import {
  convolveEnvironmentIrradiance,
  prefilterGgxEnvironmentLevels,
  specularPrefilterLevelRoughness
} from "./SpecularPrefilter";

export type EnvironmentColorSpace = "linear" | "srgb";
export type EnvironmentInputEncoding = "rgba8-linear" | "rgba8-srgb" | "rgbe";
export type EnvironmentTextureEncoding = "rgba8-linear" | "rgba8-srgb" | "rgbe";
export type EnvironmentToneMappingOperator = "linear" | "reinhard";

const A3D_EPSILON_NUMBER = 0.00001;
const A3D_MIN_PBR_ROUGHNESS = 0.045;

export interface Rgba8EnvironmentMapSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface RgbeEnvironmentMapSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface LinearHdrEnvironmentMapSource {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array | readonly number[];
}

export type EnvironmentMapResourceInput =
  | (Rgba8EnvironmentMapSource & { readonly encoding?: "rgba8-linear" | "rgba8-srgb" })
  | (RgbeEnvironmentMapSource & { readonly encoding: "rgbe" })
  | (LinearHdrEnvironmentMapSource & { readonly encoding: "linear-hdr" });

export interface EnvironmentMipGenerationOptions {
  readonly levels?: number;
  readonly blurRadius?: number;
}

export interface EnvironmentSpecularPrefilterGenerationOptions extends EnvironmentMipGenerationOptions {
  readonly sampleCount?: number;
}

export interface EnvironmentHdrEncodeOptions {
  readonly exposure?: number;
  readonly toneMapping?: EnvironmentToneMappingOperator;
  readonly outputColorSpace?: EnvironmentColorSpace;
}

export interface DiffuseIrradianceGenerationOptions {
  readonly width?: number;
  readonly height?: number;
  readonly blurRadius?: number;
  readonly sampleCount?: number;
}

export interface EnvironmentResourceSetOptions {
  readonly inputEncoding?: EnvironmentInputEncoding | "linear-hdr";
  readonly textureEncoding?: EnvironmentTextureEncoding;
  readonly outputColorSpace?: EnvironmentColorSpace;
  readonly exposure?: number;
  readonly toneMapping?: EnvironmentToneMappingOperator;
  readonly specularLevels?: number;
  readonly specularBlurRadius?: number;
  readonly specularSampleCount?: number;
  readonly irradianceWidth?: number;
  readonly irradianceHeight?: number;
  readonly irradianceBlurRadius?: number;
  readonly brdfLutSize?: number;
  readonly brdfLutSampleCount?: number;
}

export interface EnvironmentMapResourceSet {
  readonly base: Rgba8EnvironmentMapSource;
  readonly diffuseIrradiance: Rgba8EnvironmentMapSource;
  readonly specularMipLevels: readonly TextureMipLevelDescriptor[];
  readonly brdfLut: Rgba8EnvironmentMapSource;
  readonly diagnostics: {
    readonly inputEncoding: EnvironmentInputEncoding | "linear-hdr";
    readonly textureEncoding: EnvironmentTextureEncoding;
    readonly outputColorSpace: EnvironmentColorSpace;
    readonly hdrSource: boolean;
    readonly maxLinearValue: number;
    readonly specularMipCount: number;
    /** Roughness each specular level was GGX-filtered for, ordered by level. */
    readonly specularLevelRoughness: readonly number[];
    readonly specularFilterModel: "ggx-importance-sampled-equirect-prefilter";
    readonly diffuseIrradianceModel: "sh9-cosine-convolved";
    readonly diffuseIrradianceSize: readonly [number, number];
    readonly brdfLutSize: readonly [number, number];
  };
}

export interface BrdfLutDescriptor {
  readonly width?: number;
  readonly height?: number;
  readonly sampleCount?: number;
}

export function srgbChannelToLinear(value: number): number {
  const channel = validateNormalizedChannel(value, "sRGB channel");
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function linearChannelToSrgb(value: number): number {
  const channel = clampFinite(value, 0, 1, "linear channel");
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

export function decodeRgbeEnvironmentMap(source: RgbeEnvironmentMapSource): LinearHdrEnvironmentMapSource {
  validateSource(source);
  const data = new Float32Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const sourceOffset = index * 4;
    const exponent = source.data[sourceOffset + 3] ?? 0;
    const outputOffset = sourceOffset;
    if (exponent === 0) {
      data[outputOffset] = 0;
      data[outputOffset + 1] = 0;
      data[outputOffset + 2] = 0;
      data[outputOffset + 3] = 1;
      continue;
    }
    const scale = Math.pow(2, exponent - 128) / 256;
    data[outputOffset] = (source.data[sourceOffset] ?? 0) * scale;
    data[outputOffset + 1] = (source.data[sourceOffset + 1] ?? 0) * scale;
    data[outputOffset + 2] = (source.data[sourceOffset + 2] ?? 0) * scale;
    data[outputOffset + 3] = 1;
  }
  return { width: source.width, height: source.height, data };
}

export function decodeRgba8EnvironmentToLinear(
  source: Rgba8EnvironmentMapSource,
  inputColorSpace: EnvironmentColorSpace = "srgb"
): LinearHdrEnvironmentMapSource {
  validateSource(source);
  const data = new Float32Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    data[offset] = decodeColorByte(source.data[offset] ?? 0, inputColorSpace);
    data[offset + 1] = decodeColorByte(source.data[offset + 1] ?? 0, inputColorSpace);
    data[offset + 2] = decodeColorByte(source.data[offset + 2] ?? 0, inputColorSpace);
    data[offset + 3] = (source.data[offset + 3] ?? 255) / 255;
  }
  return { width: source.width, height: source.height, data };
}

export function encodeLinearHdrEnvironmentToRgba8(
  source: LinearHdrEnvironmentMapSource,
  options: EnvironmentHdrEncodeOptions = {}
): Rgba8EnvironmentMapSource {
  validateHdrSource(source);
  const exposure = options.exposure ?? 1;
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new RangeError("Environment HDR exposure must be finite and non-negative");
  }
  const toneMapping = options.toneMapping ?? "reinhard";
  const outputColorSpace = options.outputColorSpace ?? "srgb";
  const data = new Uint8Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    data[offset] = encodeColorByte(toneMap((source.data[offset] ?? 0) * exposure, toneMapping), outputColorSpace);
    data[offset + 1] = encodeColorByte(toneMap((source.data[offset + 1] ?? 0) * exposure, toneMapping), outputColorSpace);
    data[offset + 2] = encodeColorByte(toneMap((source.data[offset + 2] ?? 0) * exposure, toneMapping), outputColorSpace);
    data[offset + 3] = Math.round(clampFinite(source.data[offset + 3] ?? 1, 0, 1, "HDR alpha") * 255);
  }
  return { width: source.width, height: source.height, data };
}

export function encodeLinearHdrEnvironmentToRgbe(source: LinearHdrEnvironmentMapSource): RgbeEnvironmentMapSource {
  validateHdrSource(source);
  const data = new Uint8Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    encodeLinearRgbePixel(
      source.data[offset] ?? 0,
      source.data[offset + 1] ?? 0,
      source.data[offset + 2] ?? 0,
      source.data[offset + 3] ?? 1,
      data,
      offset
    );
  }
  return { width: source.width, height: source.height, data };
}

export function encodeLinearHdrEnvironmentToRgba16f(source: LinearHdrEnvironmentMapSource): TextureMipLevelDescriptor {
  validateHdrSource(source);
  const data = new Uint16Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    data[offset] = numberToHalfFloat(Math.max(0, source.data[offset] ?? 0));
    data[offset + 1] = numberToHalfFloat(Math.max(0, source.data[offset + 1] ?? 0));
    data[offset + 2] = numberToHalfFloat(Math.max(0, source.data[offset + 2] ?? 0));
    data[offset + 3] = numberToHalfFloat(clampFinite(source.data[offset + 3] ?? 1, 0, 1, "HDR alpha"));
  }
  return { width: source.width, height: source.height, data };
}

export function generateRgba8EnvironmentMipLevels(
  source: Rgba8EnvironmentMapSource,
  options: EnvironmentMipGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment mip levels must be a positive integer");
  }
  const blurRadius = options.blurRadius ?? 1;
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment mip blurRadius must be a non-negative integer");
  }

  const levels: TextureMipLevelDescriptor[] = [{
    width: source.width,
    height: source.height,
    data: new Uint8Array(source.data)
  }];
  while (levels.length < Math.min(requestedLevels, maxLevels)) {
    const previous = levels[levels.length - 1]!;
    levels.push(downsampleEnvironmentLevel(previous, blurRadius + levels.length - 1));
  }
  return levels;
}

/**
 * Real GGX importance-sampled specular prefilter over an RGBA8 environment.
 *
 * Each level `i` of `levelCount` is filtered for roughness `i / (levelCount - 1)`
 * by convolving the linearised source with the GGX lobe for that exact
 * roughness, so the roughness a shader assigns to a LOD is the roughness the
 * texels were actually filtered for. The previous implementation delegated to
 * `generateRgba8EnvironmentMipLevels` with a box-blur radius, which produced a
 * mip chain whose blur width was unrelated to its nominal roughness.
 *
 * `blurRadius` is retained only for call-site compatibility and no longer
 * affects the filter; `sampleCount` controls GGX sample density instead.
 */
export function generateSpecularPrefilterMipLevels(
  source: Rgba8EnvironmentMapSource,
  options: EnvironmentSpecularPrefilterGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment specular prefilter levels must be a positive integer");
  }
  const sampleCount = options.sampleCount ?? 64;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("Environment specular prefilter sampleCount must be a positive integer");
  }

  const levelCount = Math.min(requestedLevels, maxLevels);
  const linear = decodeRgba8EnvironmentToLinear(source, "srgb");
  const prefiltered = prefilterGgxEnvironmentLevels(linear, { levels: levelCount, sampleCount });
  return prefiltered.map((level, index) => {
    if (index === 0) {
      // Roughness 0 is a mirror reflection, so level 0 is the unfiltered
      // source. Copy the bytes instead of round-tripping through sRGB to keep
      // it bit-exact.
      return { width: source.width, height: source.height, data: new Uint8Array(source.data) };
    }
    const data = new Uint8Array(level.width * level.height * 4);
    for (let index2 = 0; index2 < level.width * level.height; index2 += 1) {
      const offset = index2 * 4;
      data[offset] = encodeColorByte(clamp(level.data[offset] ?? 0, 0, 1), "srgb");
      data[offset + 1] = encodeColorByte(clamp(level.data[offset + 1] ?? 0, 0, 1), "srgb");
      data[offset + 2] = encodeColorByte(clamp(level.data[offset + 2] ?? 0, 0, 1), "srgb");
      data[offset + 3] = 255;
    }
    return { width: level.width, height: level.height, data };
  });
}

/**
 * Roughness each specular prefilter level was genuinely filtered for. Callers
 * must use this rather than deriving roughness from a mip index they did not
 * generate.
 */
export { specularPrefilterLevelRoughness } from "./SpecularPrefilter";

export function generateRgbeEnvironmentMipLevels(
  source: LinearHdrEnvironmentMapSource,
  options: EnvironmentMipGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateHdrSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment RGBe mip levels must be a positive integer");
  }
  const blurRadius = options.blurRadius ?? 2;
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment RGBe mip blurRadius must be a non-negative integer");
  }

  const levels: TextureMipLevelDescriptor[] = [];
  let linearLevel: LinearHdrEnvironmentMapSource = {
    width: source.width,
    height: source.height,
    data: new Float32Array(source.data)
  };
  levels.push(encodeLinearHdrEnvironmentToRgbe(linearLevel));
  while (levels.length < Math.min(requestedLevels, maxLevels)) {
    linearLevel = downsampleLinearHdrEnvironmentLevel(linearLevel, blurRadius + levels.length - 1);
    levels.push(encodeLinearHdrEnvironmentToRgbe(linearLevel));
  }
  return levels;
}

/**
 * Real GGX specular prefilter for HDR environments, encoded as RGBE per level.
 * `generateRgbeEnvironmentMipLevels` remains available for plain mip pyramids,
 * but it is a progressive box downsample and must not be labelled as
 * roughness-prefiltered.
 */
export function generateRgbeSpecularPrefilterMipLevels(
  source: LinearHdrEnvironmentMapSource,
  options: EnvironmentSpecularPrefilterGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateHdrSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment RGBe specular prefilter levels must be a positive integer");
  }
  const sampleCount = options.sampleCount ?? 32;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("Environment RGBe specular prefilter sampleCount must be a positive integer");
  }
  return prefilterGgxEnvironmentLevels(source, {
    levels: Math.min(requestedLevels, maxLevels),
    sampleCount
  }).map((level) => encodeLinearHdrEnvironmentToRgbe({
    width: level.width,
    height: level.height,
    data: level.data
  }));
}

export function generateRgba16fEnvironmentMipLevels(
  source: LinearHdrEnvironmentMapSource,
  options: EnvironmentMipGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateHdrSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment RGBA16F mip levels must be a positive integer");
  }
  const blurRadius = options.blurRadius ?? 2;
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment RGBA16F mip blurRadius must be a non-negative integer");
  }

  const levels: TextureMipLevelDescriptor[] = [];
  let linearLevel: LinearHdrEnvironmentMapSource = {
    width: source.width,
    height: source.height,
    data: new Float32Array(source.data)
  };
  levels.push(encodeLinearHdrEnvironmentToRgba16f(linearLevel));
  while (levels.length < Math.min(requestedLevels, maxLevels)) {
    linearLevel = downsampleLinearHdrEnvironmentLevel(linearLevel, blurRadius + levels.length - 1);
    levels.push(encodeLinearHdrEnvironmentToRgba16f(linearLevel));
  }
  return levels;
}

export function generateRgba16fSpecularPrefilterMipLevels(
  source: LinearHdrEnvironmentMapSource,
  options: EnvironmentSpecularPrefilterGenerationOptions = {}
): readonly TextureMipLevelDescriptor[] {
  validateHdrSource(source);
  const maxLevels = maxMipLevels(source.width, source.height);
  const requestedLevels = options.levels ?? maxLevels;
  if (!Number.isInteger(requestedLevels) || requestedLevels < 1) {
    throw new RangeError("Environment RGBA16F specular prefilter mip levels must be a positive integer");
  }
  const sampleCount = options.sampleCount ?? 16;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("Environment RGBA16F specular prefilter sampleCount must be a positive integer");
  }

  const mipCount = Math.min(requestedLevels, maxLevels);
  const prefiltered = prefilterGgxEnvironmentLevels(source, { levels: mipCount, sampleCount });
  const levels: TextureMipLevelDescriptor[] = prefiltered.map((level) => encodeLinearHdrEnvironmentToRgba16f({
    width: level.width,
    height: level.height,
    data: level.data
  }));
  if (levels.length > 1) {
    const diffuseLevel = levels[levels.length - 1]!;
    levels[levels.length - 1] = generateRgba16fDiffuseIrradianceMipLevel(source, {
      width: diffuseLevel.width,
      height: diffuseLevel.height,
      sampleCount: Math.max(32, sampleCount * 2)
    });
  }
  return levels;
}

export function generateRgba16fDiffuseIrradianceMipLevel(
  source: LinearHdrEnvironmentMapSource,
  options: DiffuseIrradianceGenerationOptions = {}
): TextureMipLevelDescriptor {
  validateHdrSource(source);
  const width = options.width ?? Math.min(32, source.width);
  const height = options.height ?? Math.min(16, source.height);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment RGBA16F diffuse irradiance dimensions must be positive integers");
  }
  const sampleCount = options.sampleCount ?? 64;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("Environment RGBA16F diffuse irradiance sampleCount must be a positive integer");
  }

  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normal = equirectPixelDirection(x, y, width, height);
      const color = integrateDiffuseIrradianceOverHemisphere(source, normal, sampleCount);
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = color[3];
    }
  }
  return encodeLinearHdrEnvironmentToRgba16f({ width, height, data });
}

/**
 * Cosine-convolved diffuse irradiance for RGBA8 environments.
 *
 * This previously averaged a square box of source texels, which is not a cosine
 * convolution: it ignores the hemisphere orientation entirely, so two opposite
 * normals sampled from nearby texels received nearly identical "irradiance".
 * The environment is now decoded to linear, projected onto nine irradiance SH
 * bands with per-texel solid angle weights, and evaluated per output direction.
 *
 * `blurRadius` is retained for call-site compatibility and no longer affects
 * the result.
 */
export function generateDiffuseIrradianceRgba8(
  source: Rgba8EnvironmentMapSource,
  options: DiffuseIrradianceGenerationOptions = {}
): Rgba8EnvironmentMapSource {
  validateSource(source);
  const width = options.width ?? Math.min(16, source.width);
  const height = options.height ?? Math.min(8, source.height);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment diffuse irradiance dimensions must be positive integers");
  }
  const blurRadius = options.blurRadius ?? Math.max(2, Math.ceil(Math.max(source.width / width, source.height / height)));
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment diffuse irradiance blurRadius must be a non-negative integer");
  }

  const irradiance = convolveEnvironmentIrradiance(decodeRgba8EnvironmentToLinear(source, "srgb"), width, height);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = encodeColorByte(clamp(irradiance.data[offset] ?? 0, 0, 1), "srgb");
    data[offset + 1] = encodeColorByte(clamp(irradiance.data[offset + 1] ?? 0, 0, 1), "srgb");
    data[offset + 2] = encodeColorByte(clamp(irradiance.data[offset + 2] ?? 0, 0, 1), "srgb");
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Cosine-convolved diffuse irradiance for HDR environments, encoded as RGBE.
 * Replaces the previous box average for the same reason as the RGBA8 path.
 */
export function generateDiffuseIrradianceRgbe(
  source: LinearHdrEnvironmentMapSource,
  options: DiffuseIrradianceGenerationOptions = {}
): RgbeEnvironmentMapSource {
  validateHdrSource(source);
  const width = options.width ?? Math.min(16, source.width);
  const height = options.height ?? Math.min(8, source.height);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment diffuse irradiance dimensions must be positive integers");
  }
  const blurRadius = options.blurRadius ?? Math.max(2, Math.ceil(Math.max(source.width / width, source.height / height)));
  if (!Number.isInteger(blurRadius) || blurRadius < 0) {
    throw new RangeError("Environment diffuse irradiance blurRadius must be a non-negative integer");
  }

  const irradiance = convolveEnvironmentIrradiance(source, width, height);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    encodeLinearRgbePixel(
      irradiance.data[offset] ?? 0,
      irradiance.data[offset + 1] ?? 0,
      irradiance.data[offset + 2] ?? 0,
      1,
      data,
      offset
    );
  }
  return { width, height, data };
}

export function createEnvironmentMapResourceSet(
  input: EnvironmentMapResourceInput,
  options: EnvironmentResourceSetOptions = {}
): EnvironmentMapResourceSet {
  const inputEncoding = options.inputEncoding ?? input.encoding ?? "rgba8-srgb";
  const outputColorSpace = options.outputColorSpace ?? "srgb";
  const textureEncoding = options.textureEncoding ?? (outputColorSpace === "linear" ? "rgba8-linear" : "rgba8-srgb");
  const linear = toLinearHdrEnvironment(input, inputEncoding);
  const linearForTexture = textureEncoding === "rgbe"
    ? scaleLinearHdrEnvironment(linear, 1)
    : scaleLinearHdrEnvironment(linear, options.exposure ?? 1);
  const base = textureEncoding === "rgbe"
    ? encodeLinearHdrEnvironmentToRgbe(linearForTexture)
    : encodeLinearHdrEnvironmentToRgba8(linear, {
      exposure: options.exposure ?? 1,
      toneMapping: options.toneMapping ?? (inputEncoding === "rgba8-linear" || inputEncoding === "rgba8-srgb" ? "linear" : "reinhard"),
      outputColorSpace: textureEncoding === "rgba8-linear" ? "linear" : "srgb"
    });
  const specularMipLevels = textureEncoding === "rgbe"
    ? generateRgbeSpecularPrefilterMipLevels(linearForTexture, {
      levels: options.specularLevels,
      ...(options.specularSampleCount === undefined ? {} : { sampleCount: options.specularSampleCount })
    })
    : generateSpecularPrefilterMipLevels(base, {
      levels: options.specularLevels,
      ...(options.specularSampleCount === undefined ? {} : { sampleCount: options.specularSampleCount })
    });
  const diffuseIrradiance = textureEncoding === "rgbe"
    ? generateDiffuseIrradianceRgbe(linearForTexture, {
      width: options.irradianceWidth,
      height: options.irradianceHeight,
      blurRadius: options.irradianceBlurRadius
    })
    : generateDiffuseIrradianceRgba8(base, {
      width: options.irradianceWidth,
      height: options.irradianceHeight,
      blurRadius: options.irradianceBlurRadius
    });
  const brdfLut = generateApproximateBrdfLutPixels({
    width: options.brdfLutSize ?? 32,
    height: options.brdfLutSize ?? 32,
    sampleCount: options.brdfLutSampleCount
  });
  return {
    base,
    diffuseIrradiance,
    specularMipLevels,
    brdfLut,
    diagnostics: {
      inputEncoding,
      textureEncoding,
      outputColorSpace,
      hdrSource: inputEncoding === "rgbe" || inputEncoding === "linear-hdr",
      maxLinearValue: Number(maxLinearValue(linear).toFixed(6)),
      specularMipCount: specularMipLevels.length,
      specularLevelRoughness: specularPrefilterLevelRoughness(specularMipLevels.length),
      specularFilterModel: "ggx-importance-sampled-equirect-prefilter",
      diffuseIrradianceModel: "sh9-cosine-convolved",
      diffuseIrradianceSize: [diffuseIrradiance.width, diffuseIrradiance.height],
      brdfLutSize: [brdfLut.width, brdfLut.height]
    }
  };
}

/**
 * Generates the deterministic GGX split-sum DFG lookup texture used by the
 * environment-lighting shaders. The historical `Approximate` export name is
 * retained for API compatibility; each texel is numerically integrated rather
 * than evaluated from an analytic fit.
 *
 * The red channel stores the coefficient multiplied by F0 and the green
 * channel stores the grazing-angle Fresnel bias:
 *
 * `environmentSpecular * (F0 * red + green)`
 */
export function generateApproximateBrdfLutPixels(descriptor: BrdfLutDescriptor = {}): Rgba8EnvironmentMapSource {
  const width = descriptor.width ?? 32;
  const height = descriptor.height ?? 32;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Environment BRDF LUT dimensions must be positive integers");
  }
  const sampleCount = descriptor.sampleCount ?? 128;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new RangeError("Environment BRDF LUT sampleCount must be a positive integer");
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const roughness = clamp(y / Math.max(1, height - 1), 0, 1);
    for (let x = 0; x < width; x += 1) {
      const nDotV = clamp(x / Math.max(1, width - 1), 0.001, 1);
      const brdf = integrateSplitSumGgxEnvironmentBrdf(nDotV, roughness, sampleCount);
      const index = (y * width + x) * 4;
      data[index] = encodeColorByte(brdf[0], "linear");
      data[index + 1] = encodeColorByte(brdf[1], "linear");
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function integrateSplitSumGgxEnvironmentBrdf(
  nDotV: number,
  roughness: number,
  sampleCount: number
): readonly [number, number] {
  const view: readonly [number, number, number] = [
    Math.sqrt(Math.max(0, 1 - nDotV * nDotV)),
    0,
    nDotV
  ];
  let scale = 0;
  let bias = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const xi = hammersley2d(index, sampleCount);
    const halfVector = importanceSampleGgx(xi, roughness);
    const vDotH = Math.max(dot3(view, halfVector), 0);
    const light = normalize3([
      2 * vDotH * halfVector[0] - view[0],
      2 * vDotH * halfVector[1] - view[1],
      2 * vDotH * halfVector[2] - view[2]
    ]);
    const nDotL = Math.max(light[2], 0);
    const nDotH = Math.max(halfVector[2], 0);
    if (nDotL <= 0 || nDotH <= 0 || vDotH <= 0) {
      continue;
    }
    // Split-sum weight for GGX-importance-sampled half vectors. The GGX pdf is
    // D * nDotH / (4 * vDotH), so the estimator for the specular integral
    // D * V * nDotL reduces to 4 * V * nDotL * vDotH / nDotH. Dropping the
    // 4 * nDotL factor (or dividing by nDotV instead) produces values far above
    // 1 that clamp to white and destroy split-sum energy conservation.
    const visibility = 4 * ggxGeometrySmithCorrelated(nDotV, nDotL, roughness) * nDotL * vDotH / Math.max(nDotH, A3D_EPSILON_NUMBER);
    const fresnel = Math.pow(1 - vDotH, 5);
    scale += (1 - fresnel) * visibility;
    bias += fresnel * visibility;
  }
  return [
    clamp(scale / sampleCount, 0, 1),
    clamp(bias / sampleCount, 0, 1)
  ];
}

function hammersley2d(index: number, count: number): readonly [number, number] {
  return [index / count, radicalInverseVdc(index)];
}

function radicalInverseVdc(bits: number): number {
  let value = bits >>> 0;
  value = ((value << 16) | (value >>> 16)) >>> 0;
  value = (((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1)) >>> 0;
  value = (((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2)) >>> 0;
  value = (((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4)) >>> 0;
  value = (((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8)) >>> 0;
  return value * 2.3283064365386963e-10;
}

function importanceSampleGgx(
  xi: readonly [number, number],
  roughness: number
): readonly [number, number, number] {
  // Match the minimum perceptual roughness used by the PBR shader's GGX
  // distribution. Using a narrower proposal than the evaluated lobe biases the
  // first LUT row even though the runtime shader clamps that row to this value.
  const clampedRoughness = Math.max(roughness, A3D_MIN_PBR_ROUGHNESS);
  const alpha = clampedRoughness * clampedRoughness;
  const alpha2 = alpha * alpha;
  const phi = 2 * Math.PI * xi[0];
  const cosTheta = Math.sqrt((1 - xi[1]) / Math.max(1 + (alpha2 - 1) * xi[1], A3D_EPSILON_NUMBER));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return [
    Math.cos(phi) * sinTheta,
    Math.sin(phi) * sinTheta,
    cosTheta
  ];
}

function ggxGeometrySmithCorrelated(nDotV: number, nDotL: number, roughness: number): number {
  const alpha = Math.max(roughness, A3D_MIN_PBR_ROUGHNESS);
  const alpha2 = alpha * alpha * alpha * alpha;
  const lambdaV = nDotL * Math.sqrt(Math.max((nDotV - alpha2 * nDotV) * nDotV + alpha2, A3D_EPSILON_NUMBER));
  const lambdaL = nDotV * Math.sqrt(Math.max((nDotL - alpha2 * nDotL) * nDotL + alpha2, A3D_EPSILON_NUMBER));
  return 0.5 / Math.max(lambdaV + lambdaL, A3D_EPSILON_NUMBER);
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= A3D_EPSILON_NUMBER) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function dot3(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function downsampleEnvironmentLevel(level: TextureMipLevelDescriptor, blurRadius: number): TextureMipLevelDescriptor {
  const width = Math.max(1, Math.floor(level.width / 2));
  const height = Math.max(1, Math.floor(level.height / 2));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = sampleBox(level, x * 2, y * 2, Math.max(1, blurRadius));
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = color[3];
    }
  }
  return { width, height, data };
}

function downsampleLinearHdrEnvironmentLevel(source: LinearHdrEnvironmentMapSource, blurRadius: number): LinearHdrEnvironmentMapSource {
  const width = Math.max(1, Math.floor(source.width / 2));
  const height = Math.max(1, Math.floor(source.height / 2));
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = sampleLinearHdrBox(source, x * 2, y * 2, Math.max(1, blurRadius));
      const index = (y * width + x) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = color[3];
    }
  }
  return { width, height, data };
}

function integrateDiffuseIrradianceOverHemisphere(
  source: LinearHdrEnvironmentMapSource,
  normal: readonly [number, number, number],
  sampleCount: number
): readonly [number, number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const direction = tangentToWorld(cosineSampleHemisphere(hammersley2d(sampleIndex, sampleCount)), normal);
    const sample = sampleLinearHdrEquirect(source, direction);
    red += sample[0];
    green += sample[1];
    blue += sample[2];
    alpha += sample[3];
  }
  return [
    red / sampleCount,
    green / sampleCount,
    blue / sampleCount,
    alpha / sampleCount
  ];
}

function cosineSampleHemisphere(xi: readonly [number, number]): readonly [number, number, number] {
  const radius = Math.sqrt(clamp(xi[0], 0, 1));
  const phi = 2 * Math.PI * xi[1];
  return [
    radius * Math.cos(phi),
    radius * Math.sin(phi),
    Math.sqrt(Math.max(0, 1 - xi[0]))
  ];
}

function equirectPixelDirection(x: number, y: number, width: number, height: number): readonly [number, number, number] {
  const u = (x + 0.5) / width;
  const v = (y + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);
  return normalize3([
    Math.cos(phi) * sinTheta,
    Math.cos(theta),
    Math.sin(phi) * sinTheta
  ]);
}

function directionToEquirectUv(direction: readonly [number, number, number]): readonly [number, number] {
  const d = normalize3(direction);
  return [
    modulo(Math.atan2(d[2], d[0]) / (Math.PI * 2) + 0.5, 1),
    clamp(Math.acos(clamp(d[1], -1, 1)) / Math.PI, 0, 1)
  ];
}

function sampleLinearHdrEquirect(
  source: LinearHdrEnvironmentMapSource,
  direction: readonly [number, number, number]
): readonly [number, number, number, number] {
  const uv = directionToEquirectUv(direction);
  const fx = uv[0] * source.width - 0.5;
  const fy = uv[1] * source.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const c00 = sampleLinearHdrPixel(source, x0, y0);
  const c10 = sampleLinearHdrPixel(source, x0 + 1, y0);
  const c01 = sampleLinearHdrPixel(source, x0, y0 + 1);
  const c11 = sampleLinearHdrPixel(source, x0 + 1, y0 + 1);
  const top = mixColor4(c00, c10, tx);
  const bottom = mixColor4(c01, c11, tx);
  return mixColor4(top, bottom, ty);
}

function sampleLinearHdrPixel(
  source: LinearHdrEnvironmentMapSource,
  x: number,
  y: number
): readonly [number, number, number, number] {
  const wrappedX = modulo(x, source.width);
  const wrappedY = clamp(y, 0, source.height - 1);
  const index = (wrappedY * source.width + wrappedX) * 4;
  return [
    Math.max(0, source.data[index] ?? 0),
    Math.max(0, source.data[index + 1] ?? 0),
    Math.max(0, source.data[index + 2] ?? 0),
    clampFinite(source.data[index + 3] ?? 1, 0, 1, "HDR alpha")
  ];
}

function mixColor4(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
  amount: number
): readonly [number, number, number, number] {
  return [
    lerp(left[0], right[0], amount),
    lerp(left[1], right[1], amount),
    lerp(left[2], right[2], amount),
    lerp(left[3], right[3], amount)
  ];
}

function tangentToWorld(
  local: readonly [number, number, number],
  normal: readonly [number, number, number]
): readonly [number, number, number] {
  const up: readonly [number, number, number] = Math.abs(normal[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize3(cross3(up, normal));
  const bitangent = cross3(normal, tangent);
  return normalize3([
    tangent[0] * local[0] + bitangent[0] * local[1] + normal[0] * local[2],
    tangent[1] * local[0] + bitangent[1] * local[1] + normal[1] * local[2],
    tangent[2] * local[0] + bitangent[2] * local[1] + normal[2] * local[2]
  ]);
}

function cross3(left: readonly [number, number, number], right: readonly [number, number, number]): readonly [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function sampleBox(level: Rgba8EnvironmentMapSource | TextureMipLevelDescriptor, centerX: number, centerY: number, radius: number): readonly [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    const wrappedY = clamp(y, 0, level.height - 1);
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const wrappedX = modulo(x, level.width);
      const index = (wrappedY * level.width + wrappedX) * 4;
      r += level.data[index] ?? 0;
      g += level.data[index + 1] ?? 0;
      b += level.data[index + 2] ?? 0;
      a += level.data[index + 3] ?? 255;
      count += 1;
    }
  }
  return [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count),
    Math.round(a / count)
  ];
}

function sampleLinearHdrBox(
  level: LinearHdrEnvironmentMapSource,
  centerX: number,
  centerY: number,
  radius: number
): readonly [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    const wrappedY = clamp(y, 0, level.height - 1);
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const wrappedX = modulo(x, level.width);
      const index = (wrappedY * level.width + wrappedX) * 4;
      r += level.data[index] ?? 0;
      g += level.data[index + 1] ?? 0;
      b += level.data[index + 2] ?? 0;
      a += level.data[index + 3] ?? 1;
      count += 1;
    }
  }
  return [r / count, g / count, b / count, a / count];
}

function scaleLinearHdrEnvironment(source: LinearHdrEnvironmentMapSource, exposure: number): LinearHdrEnvironmentMapSource {
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new RangeError("Environment HDR exposure must be finite and non-negative");
  }
  if (exposure === 1) {
    return { width: source.width, height: source.height, data: new Float32Array(source.data) };
  }
  const data = new Float32Array(source.width * source.height * 4);
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    data[offset] = Math.max(0, source.data[offset] ?? 0) * exposure;
    data[offset + 1] = Math.max(0, source.data[offset + 1] ?? 0) * exposure;
    data[offset + 2] = Math.max(0, source.data[offset + 2] ?? 0) * exposure;
    data[offset + 3] = clampFinite(source.data[offset + 3] ?? 1, 0, 1, "HDR alpha");
  }
  return { width: source.width, height: source.height, data };
}

function encodeLinearRgbePixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  output: Uint8Array,
  offset: number
): void {
  const r = Math.max(0, red);
  const g = Math.max(0, green);
  const b = Math.max(0, blue);
  const maxChannel = Math.max(r, g, b);
  if (maxChannel < 1e-32) {
    output[offset] = 0;
    output[offset + 1] = 0;
    output[offset + 2] = 0;
    output[offset + 3] = 0;
    return;
  }
  const exponent = Math.ceil(Math.log2(maxChannel));
  const scale = 256 / Math.pow(2, exponent);
  output[offset] = clampByte(Math.round(r * scale));
  output[offset + 1] = clampByte(Math.round(g * scale));
  output[offset + 2] = clampByte(Math.round(b * scale));
  output[offset + 3] = clampByte(exponent + 128);
  if (alpha <= 0) {
    output[offset + 3] = 0;
  }
}

function numberToHalfFloat(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  if (value === Infinity) return 0x7c00;
  if (value === -Infinity) return 0xfc00;
  const sign = value < 0 ? 0x8000 : 0;
  const absolute = Math.abs(value);
  if (absolute === 0) return sign;
  if (absolute >= 65504) return sign | 0x7bff;
  if (absolute < 2 ** -14) {
    return sign | Math.round(absolute / 2 ** -24);
  }
  const exponent = Math.floor(Math.log2(absolute));
  const mantissa = Math.round((absolute / 2 ** exponent - 1) * 1024);
  return sign | ((exponent + 15) << 10) | (mantissa & 0x03ff);
}

function toLinearHdrEnvironment(input: EnvironmentMapResourceInput, inputEncoding: EnvironmentInputEncoding | "linear-hdr"): LinearHdrEnvironmentMapSource {
  switch (inputEncoding) {
    case "rgba8-linear":
      return decodeRgba8EnvironmentToLinear(input as Rgba8EnvironmentMapSource, "linear");
    case "rgba8-srgb":
      return decodeRgba8EnvironmentToLinear(input as Rgba8EnvironmentMapSource, "srgb");
    case "rgbe":
      return decodeRgbeEnvironmentMap(input as RgbeEnvironmentMapSource);
    case "linear-hdr":
      validateHdrSource(input as LinearHdrEnvironmentMapSource);
      return { width: input.width, height: input.height, data: new Float32Array((input as LinearHdrEnvironmentMapSource).data) };
  }
}

function validateSource(source: Rgba8EnvironmentMapSource): void {
  if (!Number.isInteger(source.width) || source.width <= 0 || !Number.isInteger(source.height) || source.height <= 0) {
    throw new RangeError("Environment map dimensions must be positive integers");
  }
  if (source.data.byteLength !== source.width * source.height * 4) {
    throw new RangeError("Environment map data must contain exactly width * height * 4 RGBA8 bytes");
  }
}

function validateHdrSource(source: LinearHdrEnvironmentMapSource): void {
  if (!Number.isInteger(source.width) || source.width <= 0 || !Number.isInteger(source.height) || source.height <= 0) {
    throw new RangeError("Environment HDR dimensions must be positive integers");
  }
  if (source.data.length !== source.width * source.height * 4) {
    throw new RangeError("Environment HDR data must contain exactly width * height * 4 linear RGBA values");
  }
  for (const value of source.data) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Environment HDR data must contain only finite values");
    }
  }
}

function maxMipLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function validateNormalizedChannel(value: number, label: string): number {
  return clampFinite(value, 0, 1, label);
}

function clampFinite(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return Math.max(min, Math.min(max, value));
}

function decodeColorByte(byte: number, colorSpace: EnvironmentColorSpace): number {
  const normalized = byte / 255;
  return colorSpace === "srgb" ? srgbChannelToLinear(normalized) : normalized;
}

function encodeColorByte(linear: number, colorSpace: EnvironmentColorSpace): number {
  const normalized = colorSpace === "srgb" ? linearChannelToSrgb(linear) : clampFinite(linear, 0, 1, "linear color");
  return Math.round(normalized * 255);
}

function toneMap(value: number, operator: EnvironmentToneMappingOperator): number {
  const linear = Math.max(0, value);
  return operator === "linear" ? clamp(linear, 0, 1) : linear / (1 + linear);
}

function maxLinearValue(source: LinearHdrEnvironmentMapSource): number {
  let max = 0;
  for (let index = 0; index < source.width * source.height; index += 1) {
    const offset = index * 4;
    max = Math.max(max, source.data[offset] ?? 0, source.data[offset + 1] ?? 0, source.data[offset + 2] ?? 0);
  }
  return max;
}
