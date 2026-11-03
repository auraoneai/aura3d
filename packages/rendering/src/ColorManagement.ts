export type A3DColorSpace = "linear" | "srgb";
export type A3DTextureSemantic =
  | "base-color"
  | "emissive"
  | "normal"
  | "metallic-roughness"
  | "roughness"
  | "metallic"
  | "occlusion"
  | "height"
  | "transmission"
  | "specular"
  | "sheen"
  | "anisotropy"
  | "iridescence"
  | "environment";

export interface A3DColorManagementPolicy {
  readonly lightingColorSpace: "linear";
  readonly outputColorSpace: A3DColorSpace;
  readonly texturePolicy: Readonly<Record<A3DTextureSemantic, A3DColorSpace>>;
  readonly allowLdrFallback: boolean;
  readonly fallbackBehavior: string;
}

export interface A3DColorConversionSample {
  readonly input: number;
  readonly linear: number;
  readonly srgb: number;
  readonly roundTripError: number;
}

export interface A3DTextureColorSpaceValidation {
  readonly semantic: A3DTextureSemantic;
  readonly expected: A3DColorSpace;
  readonly actual: A3DColorSpace;
  readonly pass: boolean;
  readonly warning?: string;
}

export const EXTERNAL_PARITY_TEXTURE_COLOR_POLICY: Readonly<Record<A3DTextureSemantic, A3DColorSpace>> = {
  "base-color": "srgb",
  emissive: "srgb",
  normal: "linear",
  "metallic-roughness": "linear",
  roughness: "linear",
  metallic: "linear",
  occlusion: "linear",
  height: "linear",
  transmission: "linear",
  specular: "linear",
  sheen: "srgb",
  anisotropy: "linear",
  iridescence: "linear",
  environment: "linear"
};

export function createExternalParityColorManagementPolicy(options: {
  readonly outputColorSpace?: A3DColorSpace;
  readonly allowLdrFallback?: boolean;
} = {}): A3DColorManagementPolicy {
  if (options === null || typeof options !== "object") throw new RangeError("Invalid color management policy.");
  const outputColorSpace = options.outputColorSpace === undefined ? "srgb" : options.outputColorSpace;
  const allowLdrFallback = options.allowLdrFallback === undefined ? true : options.allowLdrFallback;
  requireLegacyColorSpace(outputColorSpace);
  if (typeof allowLdrFallback !== "boolean") throw new RangeError("Invalid LDR fallback policy.");
  return {
    lightingColorSpace: "linear",
    outputColorSpace,
    texturePolicy: EXTERNAL_PARITY_TEXTURE_COLOR_POLICY,
    allowLdrFallback,
    fallbackBehavior: "HDR render targets are preferred. LDR fallback must keep linear lighting and tone-map to the configured output color space."
  };
}

export function srgbToLinearChannel(value: number): number {
  const channel = clamp01(value);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgbChannel(value: number): number {
  const channel = clamp01(value);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function convertColorSpace(
  color: readonly [number, number, number, number],
  from: A3DColorSpace,
  to: A3DColorSpace
): [number, number, number, number] {
  requireLegacyColorSpace(from);
  requireLegacyColorSpace(to);
  if (from === to) return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2]), clamp01(color[3])];
  const convert = from === "srgb" && to === "linear" ? srgbToLinearChannel : linearToSrgbChannel;
  return [convert(color[0]), convert(color[1]), convert(color[2]), clamp01(color[3])];
}

export function validateTextureColorSpace(
  semantic: A3DTextureSemantic,
  actual: A3DColorSpace,
  policy: A3DColorManagementPolicy = createExternalParityColorManagementPolicy()
): A3DTextureColorSpaceValidation {
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL_PARITY_TEXTURE_COLOR_POLICY, semantic)) {
    throw new RangeError(`Unsupported texture semantic: ${String(semantic)}.`);
  }
  requireLegacyColorSpace(actual);
  const expected = policy.texturePolicy[semantic];
  requireLegacyColorSpace(expected);
  const pass = expected === actual;
  return {
    semantic,
    expected,
    actual,
    pass,
    ...(pass ? {} : { warning: `${semantic} texture must be tagged ${expected}; received ${actual}.` })
  };
}

export function createColorConversionSamples(samples: readonly number[] = [0, 0.0031308, 0.18, 0.5, 1]): readonly A3DColorConversionSample[] {
  return samples.map((input) => {
    const linear = srgbToLinearChannel(input);
    const srgb = linearToSrgbChannel(linear);
    return {
      input,
      linear: round(linear),
      srgb: round(srgb),
      roundTripError: round(Math.abs(clamp01(input) - srgb))
    };
  });
}

/**
 * Scene-referred, extended-range color contract. Unlike the original
 * `A3DColorSpace` helpers above, these functions never implicitly clamp RGB.
 * Both display spaces use the sRGB transfer function but have different D65
 * primaries. A linear space can contain negative values and values above one.
 */
export type A3DManagedColorSpace = "linear-srgb" | "srgb" | "linear-display-p3" | "display-p3";
export type A3DColorPrimaries = "srgb" | "display-p3";
export type A3DColorTransfer = "linear" | "srgb";
export type A3DAlphaMode = "straight" | "premultiplied";
export type A3DColorGamutMapping = "preserve" | "clip";
export type A3DColorToneMapping = "none" | "reinhard";

export interface A3DManagedColorConversionOptions {
  /** Clip target linear RGB to [0, 1] only when a bounded gamut is required. */
  readonly gamutMapping?: A3DColorGamutMapping;
  /** Premultiplication is interpreted in the representation supplied by the caller. */
  readonly inputAlphaMode?: A3DAlphaMode;
  readonly outputAlphaMode?: A3DAlphaMode;
}

export interface A3DColorOutputOptions extends A3DManagedColorConversionOptions {
  /** Scene-linear multiplier before tone mapping. Zero is permitted. */
  readonly exposure?: number;
  readonly toneMapping?: A3DColorToneMapping;
}

type Color3 = [number, number, number];
type Matrix3 = [Color3, Color3, Color3];
type Color4 = readonly [number, number, number, number];

// CIE xy chromaticities: IEC sRGB and Display-P3 primaries, both with a D65
// white. Construct their RGB-to-XYZ transforms from the chromaticities and white
// rather than rounding a precomputed conversion matrix.
const WHITE_D65: readonly [number, number] = [0.3127, 0.3290];
const PRIMARY_CHROMATICITIES: Readonly<Record<A3DColorPrimaries, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>> = {
  srgb: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]],
  "display-p3": [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]]
};

function multiplyMatrixVector(matrix: Matrix3, value: readonly [number, number, number]): Color3 {
  return matrix.map((row) => row[0] * value[0] + row[1] * value[1] + row[2] * value[2]) as Color3;
}

function inverseMatrix(matrix: Matrix3): Matrix3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) throw new Error("Color primary matrix is singular.");
  const inv = 1 / determinant;
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv]
  ];
}

function xyzFromChromaticity([x, y]: readonly [number, number]): Color3 {
  return [x / y, 1, (1 - x - y) / y];
}

function primaryToXyz(primaries: A3DColorPrimaries): Matrix3 {
  const [red, green, blue] = PRIMARY_CHROMATICITIES[primaries].map(xyzFromChromaticity) as [Color3, Color3, Color3];
  const unscaled: Matrix3 = [
    [red[0], green[0], blue[0]],
    [red[1], green[1], blue[1]],
    [red[2], green[2], blue[2]]
  ];
  const scale = multiplyMatrixVector(inverseMatrix(unscaled), xyzFromChromaticity(WHITE_D65));
  return unscaled.map((row) => [row[0] * scale[0], row[1] * scale[1], row[2] * scale[2]]) as Matrix3;
}

const TO_XYZ: Readonly<Record<A3DColorPrimaries, Matrix3>> = {
  srgb: primaryToXyz("srgb"),
  "display-p3": primaryToXyz("display-p3")
};
const FROM_XYZ: Readonly<Record<A3DColorPrimaries, Matrix3>> = {
  srgb: inverseMatrix(TO_XYZ.srgb),
  "display-p3": inverseMatrix(TO_XYZ["display-p3"])
};

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

function requireLegacyColorSpace(space: unknown): asserts space is A3DColorSpace {
  if (space !== "linear" && space !== "srgb") throw new RangeError(`Unsupported color space: ${String(space)}.`);
}

function requirePrimaries(primaries: A3DColorPrimaries): void {
  if (primaries !== "srgb" && primaries !== "display-p3") throw new RangeError(`Unsupported color primaries: ${String(primaries)}.`);
}

function colorSpaceParts(space: A3DManagedColorSpace): { readonly primaries: A3DColorPrimaries; readonly transfer: A3DColorTransfer } {
  switch (space) {
    case "linear-srgb": return { primaries: "srgb", transfer: "linear" };
    case "srgb": return { primaries: "srgb", transfer: "srgb" };
    case "linear-display-p3": return { primaries: "display-p3", transfer: "linear" };
    case "display-p3": return { primaries: "display-p3", transfer: "srgb" };
    default: throw new RangeError(`Unsupported managed color space: ${String(space)}.`);
  }
}

/** Decode a finite, sign-extended sRGB transfer value without gamut clipping. */
export function decodeColorTransfer(value: number, transfer: A3DColorTransfer): number {
  requireFinite(value, "Color channel");
  if (transfer === "linear") return value;
  if (transfer !== "srgb") throw new RangeError(`Unsupported color transfer: ${String(transfer)}.`);
  const magnitude = Math.abs(value);
  const decoded = magnitude <= 0.04045 ? magnitude / 12.92 : ((magnitude + 0.055) / 1.055) ** 2.4;
  requireFinite(decoded, "Decoded color channel");
  return Math.sign(value) * decoded;
}

/** Encode a finite, sign-extended linear value using the requested transfer. */
export function encodeColorTransfer(value: number, transfer: A3DColorTransfer): number {
  requireFinite(value, "Color channel");
  if (transfer === "linear") return value;
  if (transfer !== "srgb") throw new RangeError(`Unsupported color transfer: ${String(transfer)}.`);
  const magnitude = Math.abs(value);
  const encoded = magnitude <= 0.0031308 ? magnitude * 12.92 : 1.055 * magnitude ** (1 / 2.4) - 0.055;
  requireFinite(encoded, "Encoded color channel");
  return Math.sign(value) * encoded;
}

/** Convert scene-linear primaries without applying a transfer or gamut mapping. */
export function convertColorPrimaries(
  color: readonly [number, number, number],
  from: A3DColorPrimaries,
  to: A3DColorPrimaries
): Color3 {
  requirePrimaries(from);
  requirePrimaries(to);
  for (let index = 0; index < 3; index++) requireFinite(color[index], `Color channel ${index}`);
  if (from === to) return [color[0], color[1], color[2]];
  const converted = multiplyMatrixVector(FROM_XYZ[to], multiplyMatrixVector(TO_XYZ[from], color));
  converted.forEach((value) => requireFinite(value, "Converted color channel"));
  return converted;
}

function validateFiniteColor(color: Color4): void {
  for (let index = 0; index < 4; index++) requireFinite(color[index], `Color channel ${index}`);
}

function validateOptions(options: A3DManagedColorConversionOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options)) throw new RangeError("Invalid color conversion options.");
  for (const mode of [
    options.inputAlphaMode === undefined ? "straight" : options.inputAlphaMode,
    options.outputAlphaMode === undefined ? "straight" : options.outputAlphaMode
  ]) {
    if (mode !== "straight" && mode !== "premultiplied") throw new RangeError(`Unsupported alpha mode: ${String(mode)}.`);
  }
  const gamut = options.gamutMapping === undefined ? "preserve" : options.gamutMapping;
  if (gamut !== "preserve" && gamut !== "clip") throw new RangeError(`Unsupported gamut mapping: ${String(gamut)}.`);
}

function validateColorAndOptions(color: Color4, options: A3DManagedColorConversionOptions): void {
  validateFiniteColor(color);
  validateOptions(options);
  if (color[3] < 0 || color[3] > 1) throw new RangeError("Alpha must be between 0 and 1.");
}

function transformManagedColor(
  color: Color4,
  from: A3DManagedColorSpace,
  to: A3DManagedColorSpace,
  options: A3DManagedColorConversionOptions,
  exposure: number,
  toneMapping: A3DColorToneMapping
): [number, number, number, number] {
  validateColorAndOptions(color, options);
  const source = colorSpaceParts(from);
  const target = colorSpaceParts(to);
  const alpha = color[3];
  const inputAlphaMode = options.inputAlphaMode ?? "straight";
  const outputAlphaMode = options.outputAlphaMode ?? "straight";
  if (from === to && exposure === 1 && toneMapping === "none"
      && (options.gamutMapping ?? "preserve") === "preserve"
      && inputAlphaMode === outputAlphaMode && (inputAlphaMode === "straight" || alpha > 0)) {
    return [color[0], color[1], color[2], alpha];
  }
  let rgb: Color3 = [0, 1, 2].map((index) => {
    const channel = inputAlphaMode === "premultiplied" ? (alpha === 0 ? 0 : color[index] / alpha) : color[index];
    return decodeColorTransfer(channel, source.transfer);
  }) as Color3;

  // Tone mapping operates on scene-linear values, before conversion to the
  // display primaries. Negative values remain available until gamut mapping.
  rgb = rgb.map((channel) => {
    const exposed = channel * exposure;
    requireFinite(exposed, "Exposed color channel");
    return toneMapping === "reinhard" && exposed >= 0 ? exposed / (1 + exposed) : exposed;
  }) as Color3;
  rgb = convertColorPrimaries(rgb, source.primaries, target.primaries);
  const outputScale = outputAlphaMode === "premultiplied" ? alpha : 1;
  const encoded = rgb.map((channel) => {
    const mapped = options.gamutMapping === "clip" ? Math.max(0, Math.min(1, channel)) : channel;
    const result = encodeColorTransfer(mapped, target.transfer) * outputScale;
    requireFinite(result, "Output color channel");
    return result;
  });
  return [encoded[0], encoded[1], encoded[2], alpha];
}

/** Change primaries and/or transfer while preserving finite extended range by default. */
export function convertManagedColor(
  color: Color4,
  from: A3DManagedColorSpace,
  to: A3DManagedColorSpace,
  options: A3DManagedColorConversionOptions = {}
): [number, number, number, number] {
  return transformManagedColor(color, from, to, options, 1, "none");
}

/**
 * Data textures are numerical values, not colors: no transfer or primary
 * conversion is applied. Color textures, including linear environments, use
 * the same managed conversion as other scene colors.
 */
export function convertManagedTextureColor(
  color: Color4,
  semantic: A3DTextureSemantic,
  from: A3DManagedColorSpace,
  to: A3DManagedColorSpace,
  options: A3DManagedColorConversionOptions = {}
): [number, number, number, number] {
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL_PARITY_TEXTURE_COLOR_POLICY, semantic)) {
    throw new RangeError(`Unsupported texture semantic: ${String(semantic)}.`);
  }
  if (semantic === "base-color" || semantic === "emissive" || semantic === "sheen" || semantic === "environment") {
    return convertManagedColor(color, from, to, options);
  }
  validateFiniteColor(color);
  validateOptions(options);
  colorSpaceParts(from);
  colorSpaceParts(to);
  if ((options.gamutMapping ?? "preserve") !== "preserve" || (options.inputAlphaMode ?? "straight") !== "straight" || (options.outputAlphaMode ?? "straight") !== "straight") {
    throw new RangeError("Data textures do not support gamut mapping or alpha premultiplication.");
  }
  return [color[0], color[1], color[2], color[3]];
}

/**
 * Explicit scene-to-display stages: exposure, tone map, target primaries,
 * optional gamut clipping, output transfer and alpha association. Display
 * output is bounded by default; use `gamutMapping: "preserve"` only for an
 * explicitly extended-range destination.
 */
export function transformColorForOutput(
  color: Color4,
  from: A3DManagedColorSpace,
  to: A3DManagedColorSpace,
  options: A3DColorOutputOptions = {}
): [number, number, number, number] {
  validateOptions(options);
  const exposure = options.exposure === undefined ? 1 : options.exposure;
  requireFinite(exposure, "Exposure");
  if (exposure < 0) throw new RangeError("Exposure must not be negative.");
  const toneMapping = options.toneMapping === undefined ? "none" : options.toneMapping;
  if (toneMapping !== "none" && toneMapping !== "reinhard") throw new RangeError(`Unsupported tone mapping: ${String(toneMapping)}.`);
  return transformManagedColor(color, from, to, { ...options, gamutMapping: options.gamutMapping === undefined ? "clip" : options.gamutMapping }, exposure, toneMapping);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
