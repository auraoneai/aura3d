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
  return {
    lightingColorSpace: "linear",
    outputColorSpace: options.outputColorSpace ?? "srgb",
    texturePolicy: EXTERNAL_PARITY_TEXTURE_COLOR_POLICY,
    allowLdrFallback: options.allowLdrFallback ?? true,
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
  if (from === to) return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2]), clamp01(color[3])];
  const convert = from === "srgb" && to === "linear" ? srgbToLinearChannel : linearToSrgbChannel;
  return [convert(color[0]), convert(color[1]), convert(color[2]), clamp01(color[3])];
}

export function validateTextureColorSpace(
  semantic: A3DTextureSemantic,
  actual: A3DColorSpace,
  policy: A3DColorManagementPolicy = createExternalParityColorManagementPolicy()
): A3DTextureColorSpaceValidation {
  const expected = policy.texturePolicy[semantic];
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
