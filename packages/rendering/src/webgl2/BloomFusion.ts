/**
 * Look-neutral bloom pass fusion settings (WebGL2 device). Enabled by the engine for `quality: "auto"` / `"cinematic"`
 * only (`device.bloomFusedPasses`); `quality: "production"` never reads these. `AuraBloomFusion` (contracts/quality.ts)
 * picks one of the two configs below. The separable default is the variant that kept the PBR viewer's software-GL frame
 * time at or below the unfused chain while cutting draws (see evidence/vs-threejs/4.3.7/bloom-fusion-variants.json).
 */
import { DEFAULT_BLOOM_FUSION_MODE, type AuraBloomFusion } from "../contracts/quality";

export interface BloomFusionConfig {
  /** One-pass weighted mip sum; the full-resolution upsample is folded into the composite. */
  readonly accumulate: boolean;
  /** Mips at or above this level blur in one 2-D pass instead of two separable passes (5 or more = never). */
  readonly blur2dFromLevel: number;
  /** Bright extract folded into the level-0 downsample (needs an exact 2:1 source). */
  readonly extract: boolean;
}

/** A mip blurs in one 2-D pass when (2r+1)^2 * width * height stays at or under this many texel fetches. */
export const BLOOM_FUSED_BLUR_TAP_BUDGET = 7_000_000;
/** Largest radius a single 2-D pass supports (the shader loops over a fixed window). */
export const BLOOM_FUSED_BLUR_MAX_RADIUS = 24;

/** `"separable"`: draw-removing folds that add no fill; 2-D blur only on the two smallest mips of a five-mip pyramid. */
export const SEPARABLE_BLOOM_FUSION: BloomFusionConfig = Object.freeze({ accumulate: true, blur2dFromLevel: 3, extract: true });
/** `"fused-2d"`: mips 1..4 in one 2-D pass each. Opt-in until a real-GPU receipt exists. */
export const FUSED_2D_BLOOM_FUSION: BloomFusionConfig = Object.freeze({ accumulate: true, blur2dFromLevel: 1, extract: true });

export const DEFAULT_BLOOM_FUSION: BloomFusionConfig = SEPARABLE_BLOOM_FUSION;

export function resolveBloomFusionConfig(mode: AuraBloomFusion = DEFAULT_BLOOM_FUSION_MODE): BloomFusionConfig {
  return mode === "fused-2d" ? FUSED_2D_BLOOM_FUSION : SEPARABLE_BLOOM_FUSION;
}

/** Whether one mip takes the single 2-D blur pass (true) or the separable H+V pair (false). Shared by the pass code and the tests. */
export function bloomLevelBlursIn2d(
  fusion: BloomFusionConfig,
  level: number,
  size: { readonly width: number; readonly height: number },
  radius: number
): boolean {
  const taps = (2 * radius + 1) * (2 * radius + 1) * size.width * size.height;
  return level >= fusion.blur2dFromLevel && radius <= BLOOM_FUSED_BLUR_MAX_RADIUS && taps <= BLOOM_FUSED_BLUR_TAP_BUDGET;
}
