export type AnimationMaterialTreatment = "preserve-pbr" | "soft-toon" | "cel" | "flat-readable";

export interface AnimationMaterialStyleOptions {
  readonly treatment?: AnimationMaterialTreatment | undefined;
  readonly outline?: boolean | undefined;
  readonly rampSteps?: number | undefined;
  readonly saturationBoost?: number | undefined;
  readonly roughnessFloor?: number | undefined;
}

export interface AnimationMaterialStyle {
  readonly kind: "animation-material-style";
  readonly treatment: AnimationMaterialTreatment;
  readonly outline: boolean;
  readonly rampSteps: number;
  readonly saturationBoost: number;
  readonly roughnessFloor: number;
  readonly assetOverrideMetadata: readonly string[];
}

export function createAnimationMaterialStyle(options: AnimationMaterialStyleOptions = {}): AnimationMaterialStyle {
  const treatment = options.treatment ?? "soft-toon";
  return {
    kind: "animation-material-style",
    treatment,
    outline: options.outline ?? treatment === "cel",
    rampSteps: options.rampSteps ?? (treatment === "cel" ? 4 : 7),
    saturationBoost: options.saturationBoost ?? 0.08,
    roughnessFloor: options.roughnessFloor ?? 0.48,
    assetOverrideMetadata: ["animationMaterialTreatment", "toonRampSteps", "outlineEligible", "preserveSkinning"]
  };
}
