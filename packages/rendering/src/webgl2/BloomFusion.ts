/**
 * Look-neutral bloom pass fusion settings (WebGL2 device). Enabled by the engine for `quality: "auto"` / `"cinematic"`
 * only (`device.bloomFusedPasses`); `quality: "production"` never reads these. The defaults are the variant that kept
 * the PBR viewer's software-GL frame time at or below the unfused chain while cutting draws (see
 * evidence/vs-threejs/4.3.7/bloom-fusion-variants.json).
 */
export interface BloomFusionConfig {
  /** One-pass weighted mip sum; the full-resolution upsample is folded into the composite. */
  readonly accumulate: boolean;
  /** Mips at or above this level blur in one 2-D pass instead of two separable passes (5 or more = never). */
  readonly blur2dFromLevel: number;
  /** Bright extract folded into the level-0 downsample (needs an exact 2:1 source). */
  readonly extract: boolean;
}

export const DEFAULT_BLOOM_FUSION: BloomFusionConfig = { accumulate: true, blur2dFromLevel: 3, extract: true };
