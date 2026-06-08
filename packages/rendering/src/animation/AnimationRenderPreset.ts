import { createAnimationMaterialStyle, type AnimationMaterialStyle, type AnimationMaterialStyleOptions } from "./AnimationMaterialStyle.js";

export interface AnimationRenderPresetOptions {
  readonly name?: string | undefined;
  readonly resolution?: { readonly width: number; readonly height: number } | undefined;
  readonly materialStyle?: AnimationMaterialStyleOptions | undefined;
  readonly reducedMotion?: boolean | undefined;
  readonly reducedFlash?: boolean | undefined;
}

export interface AnimationRenderPresetEvidence {
  readonly kind: "animation-render-preset-evidence";
  readonly name: string;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly lights: readonly string[];
  readonly shadows: { readonly soft: boolean; readonly contact: boolean };
  readonly postprocess: { readonly bloom: number; readonly colorGrade: string; readonly fogDepthCue: boolean };
  readonly materialStyle: AnimationMaterialStyle;
  readonly frameBudgetMs: number;
  readonly debugOverlaysAllowedInExport: false;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

export function createAnimationRenderPreset(options: AnimationRenderPresetOptions = {}): AnimationRenderPresetEvidence {
  const reducedMotion = options.reducedMotion ?? false;
  const reducedFlash = options.reducedFlash ?? false;
  return {
    kind: "animation-render-preset-evidence",
    name: options.name ?? "moon-garden-animation",
    resolution: options.resolution ?? { width: 1280, height: 720 },
    lights: ["soft-key", "cool-rim", "set-fill", "emissive-practicals"],
    shadows: { soft: true, contact: true },
    postprocess: {
      bloom: reducedFlash ? 0.08 : 0.18,
      colorGrade: "storybook-night",
      fogDepthCue: true
    },
    materialStyle: createAnimationMaterialStyle(options.materialStyle),
    frameBudgetMs: 16.7,
    debugOverlaysAllowedInExport: false,
    reducedMotion,
    reducedFlash
  };
}
