import {
  applyToneMappingPreset,
  createToneMappingCalibration,
  toneMapFloatPixels,
  toneMapPixels,
  toneMappingPresets,
  type HdrToneMappingResult,
  type PostProcessColorSpace,
  type ToneMappingCalibration,
  type ToneMappingOperator,
  type ToneMappingOptions,
  type ToneMappingPreset,
  type ToneMappingPresetName,
  type ToneMappingPresetResult,
  type ToneMappingResult
} from "./PostProcessPass";

export type V4ToneMappingIntent = "product-catalog" | "material-review" | "interior" | "interactive" | "debug";

export interface V4ToneMappingPolicy {
  readonly intent: V4ToneMappingIntent;
  readonly operator: ToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly gamma: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly outputColorSpace: PostProcessColorSpace;
  readonly preset: ToneMappingPresetName;
  readonly calibration: ToneMappingCalibration;
}

const INTENT_PRESETS: Readonly<Record<V4ToneMappingIntent, ToneMappingPresetName>> = {
  "product-catalog": "cinematic",
  "material-review": "realistic",
  interior: "natural",
  interactive: "vibrant",
  debug: "natural"
};

export function createV4ToneMappingPolicy(
  intent: V4ToneMappingIntent,
  overrides: ToneMappingOptions = {}
): V4ToneMappingPolicy {
  const presetName = INTENT_PRESETS[intent];
  const preset = toneMappingPresets[presetName];
  const toneMapping = {
    ...preset.toneMapping,
    ...overrides
  };
  return {
    intent,
    operator: toneMapping.operator,
    exposure: toneMapping.exposure,
    whitePoint: toneMapping.whitePoint,
    gamma: toneMapping.gamma,
    inputColorSpace: toneMapping.inputColorSpace,
    outputColorSpace: toneMapping.outputColorSpace,
    preset: presetName,
    calibration: createToneMappingCalibration(toneMapping)
  };
}

export function toneMapV4Pixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  policy: V4ToneMappingPolicy
): ToneMappingResult {
  return toneMapPixels(pixels, width, height, {
    exposure: policy.exposure,
    whitePoint: policy.whitePoint,
    gamma: policy.gamma,
    operator: policy.operator,
    inputColorSpace: policy.inputColorSpace,
    outputColorSpace: policy.outputColorSpace
  });
}

export function toneMapV4HdrPixels(
  pixels: Float32Array,
  width: number,
  height: number,
  policy: V4ToneMappingPolicy
): HdrToneMappingResult {
  return toneMapFloatPixels(pixels, width, height, {
    exposure: policy.exposure,
    whitePoint: policy.whitePoint,
    gamma: policy.gamma,
    operator: policy.operator,
    outputColorSpace: policy.outputColorSpace
  });
}

export function applyV4ToneMappingPreset(
  pixels: Uint8Array,
  width: number,
  height: number,
  intent: V4ToneMappingIntent
): ToneMappingPresetResult {
  return applyToneMappingPreset(pixels, width, height, INTENT_PRESETS[intent]);
}

export function listV4ToneMappingPresets(): readonly ToneMappingPreset[] {
  return Object.values(toneMappingPresets);
}
