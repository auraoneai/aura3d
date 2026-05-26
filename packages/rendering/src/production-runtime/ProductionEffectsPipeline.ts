import type { RenderSource, RendererPostProcessOptions, RendererShadowOptions } from "../Renderer";
import type { ProductionRenderProof } from "./ProductionRendererTypes";

export interface ProductionEffectsOptions {
  readonly shadow?: RendererShadowOptions | boolean;
  readonly postprocess?: RendererPostProcessOptions | boolean;
  readonly transparentItemCount?: number;
}

export interface ProductionEffectsSummary {
  readonly pass: boolean;
  readonly shadowProof: boolean;
  readonly transparencyProof: boolean;
  readonly postprocessProof: boolean;
  readonly drawCalls: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly failures: readonly string[];
}

export function createProductionEffectsRenderSource(source: RenderSource, options: ProductionEffectsOptions = {}): RenderSource {
  return {
    ...source,
    shadow: options.shadow ?? {
      enabled: true,
      size: 512,
      bias: 0.0008,
      strength: 0.48,
      filter: "pcf",
      pcfRadius: 1.25,
      pcfSamples: 9
    },
    postprocess: options.postprocess ?? {
      targetFormat: "rgba8",
      toneMapping: {
        operator: "filmic",
        exposure: 1.08,
        whitePoint: 1.18,
        inputColorSpace: "linear",
        outputColorSpace: "srgb"
      },
      colorGrade: {
        contrast: 1.08,
        saturation: 1.06,
        vibrance: 0.08,
        vignette: 0.12,
        sharpening: 0.24
      },
      bloom: {
        threshold: 0.84,
        intensity: 0.08,
        radius: 1
      },
      fxaa: {
        edgeThreshold: 0.08,
        subpixelBlend: 0.55
      }
    }
  };
}

export function summarizeProductionEffectsProof(proof: ProductionRenderProof, options: ProductionEffectsOptions = {}): ProductionEffectsSummary {
  const shadowProof = proof.diagnostics.drawCalls >= 2;
  const transparencyProof = (options.transparentItemCount ?? 0) > 0;
  const postprocessProof = proof.pixels.uniqueColorBuckets > 12 && proof.pixels.maxLuma > 40;
  const failures = [
    ...(!proof.realWebGL2 ? ["not a real WebGL2 proof"] : []),
    ...(proof.mockDevice ? ["mock renderer was used"] : []),
    ...(proof.canvas2dProof ? ["Canvas 2D proof was used"] : []),
    ...(!shadowProof ? ["shadow pass did not add draw-call evidence"] : []),
    ...(!transparencyProof ? ["transparent item ordering was not declared"] : []),
    ...(!postprocessProof ? ["postprocess pixel metrics are too weak"] : []),
    ...(proof.pixels.nonBlackPixels <= 1000 ? ["visible pixel count is too low"] : [])
  ];
  return {
    pass: failures.length === 0,
    shadowProof,
    transparencyProof,
    postprocessProof,
    drawCalls: proof.diagnostics.drawCalls,
    nonBlackPixels: proof.pixels.nonBlackPixels,
    uniqueColorBuckets: proof.pixels.uniqueColorBuckets,
    failures
  };
}
