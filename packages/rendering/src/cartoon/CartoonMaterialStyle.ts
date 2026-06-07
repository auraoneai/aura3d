export type CartoonMaterialTreatment = "preserve-pbr" | "soft-toon" | "cel" | "flat-readable";

export interface CartoonMaterialStyleOptions {
  readonly treatment?: CartoonMaterialTreatment | undefined;
  readonly outline?: boolean | undefined;
  readonly rampSteps?: number | undefined;
  readonly saturationBoost?: number | undefined;
  readonly roughnessFloor?: number | undefined;
}

export interface CartoonMaterialStyle {
  readonly kind: "cartoon-material-style";
  readonly treatment: CartoonMaterialTreatment;
  readonly outline: boolean;
  readonly rampSteps: number;
  readonly saturationBoost: number;
  readonly roughnessFloor: number;
  readonly assetOverrideMetadata: readonly string[];
}

export function createCartoonMaterialStyle(options: CartoonMaterialStyleOptions = {}): CartoonMaterialStyle {
  const treatment = options.treatment ?? "soft-toon";
  return {
    kind: "cartoon-material-style",
    treatment,
    outline: options.outline ?? treatment === "cel",
    rampSteps: options.rampSteps ?? (treatment === "cel" ? 4 : 7),
    saturationBoost: options.saturationBoost ?? 0.08,
    roughnessFloor: options.roughnessFloor ?? 0.48,
    assetOverrideMetadata: ["cartoonMaterialTreatment", "toonRampSteps", "outlineEligible", "preserveSkinning"]
  };
}
