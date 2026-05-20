import { colorGradePixels, type ColorGradeOptions, type ColorGradeResult } from "../PostProcessPass";

export type V4ColorGradePreset = "catalog-hero" | "material-neutral" | "interior-balanced";

export function runV4ColorGrade(
  pixels: Uint8Array,
  width: number,
  height: number,
  preset: V4ColorGradePreset,
  overrides: ColorGradeOptions = {}
): ColorGradeResult {
  return colorGradePixels(pixels, width, height, { ...presetOptions(preset), ...overrides });
}

function presetOptions(preset: V4ColorGradePreset): Required<ColorGradeOptions> {
  switch (preset) {
    case "catalog-hero":
      return { contrast: 1.12, temperature: 0.04, tint: 0, saturation: 1.04, vibrance: 0.12, vignette: 0.08, sharpening: 0.25 };
    case "material-neutral":
      return { contrast: 1, temperature: 0, tint: 0, saturation: 1, vibrance: 0, vignette: 0, sharpening: 0.15 };
    case "interior-balanced":
      return { contrast: 1.06, temperature: -0.03, tint: 0.02, saturation: 0.98, vibrance: 0.08, vignette: 0.05, sharpening: 0.18 };
  }
}
