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

export type ExternalParityToneMappingIntent = "product-catalog" | "material-review" | "interior" | "interactive" | "debug";

export interface ExternalParityToneMappingPolicy {
  readonly intent: ExternalParityToneMappingIntent;
  readonly operator: ToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly gamma: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly outputColorSpace: PostProcessColorSpace;
  readonly preset: ToneMappingPresetName;
  readonly calibration: ToneMappingCalibration;
}

const INTENT_PRESETS: Readonly<Record<ExternalParityToneMappingIntent, ToneMappingPresetName>> = {
  "product-catalog": "cinematic",
  "material-review": "realistic",
  interior: "natural",
  interactive: "vibrant",
  debug: "natural"
};

export function createExternalParityToneMappingPolicy(
  intent: ExternalParityToneMappingIntent,
  overrides: ToneMappingOptions = {}
): ExternalParityToneMappingPolicy {
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

export function toneMapExternalParityPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  policy: ExternalParityToneMappingPolicy
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

export function toneMapExternalParityHdrPixels(
  pixels: Float32Array,
  width: number,
  height: number,
  policy: ExternalParityToneMappingPolicy
): HdrToneMappingResult {
  return toneMapFloatPixels(pixels, width, height, {
    exposure: policy.exposure,
    whitePoint: policy.whitePoint,
    gamma: policy.gamma,
    operator: policy.operator,
    outputColorSpace: policy.outputColorSpace
  });
}

export function applyExternalParityToneMappingPreset(
  pixels: Uint8Array,
  width: number,
  height: number,
  intent: ExternalParityToneMappingIntent
): ToneMappingPresetResult {
  return applyToneMappingPreset(pixels, width, height, INTENT_PRESETS[intent]);
}

export function listExternalParityToneMappingPresets(): readonly ToneMappingPreset[] {
  return Object.values(toneMappingPresets);
}
