// PRD-03 §6.6 / Q-14-1: retune for A3D_QR_POST default-on.
//
// The v2 bloom has no hidden ×7/×17 response gain, so the legacy recipe left
// this route far darker with post on than the `-post` control. Every value
// here is read only by the v2 chain: `postIntensity`, `knee` and
// `clampLuminance` are inert on the legacy bridge, and `colorGrade.exposure`
// only applies with the flag on. The `-post` frame is therefore unchanged.

/** v2 bloom composite intensity (`hdr + bloom * intensity`, clamped to [0, 4]). */
export const POST_V2_BLOOM_INTENSITY = 2.5;
/** v2 prefilter knee ratio: bloom ramps in from `threshold * (1 - knee)`. */
export const POST_V2_BLOOM_KNEE = 1;
/** v2 exposure multiplier folded into `colorGrade.exposure`. */
export const POST_V2_EXPOSURE = 1.15;

interface BloomBuilderLike {
  toJSON(): unknown;
}

/**
 * Writes the v2-only bloom fields onto the builder's node (builders store the
 * node by reference) and returns the same builder. `scale` keeps reduced-motion
 * variants proportional to the authored legacy intensity.
 */
export function withPostV2Bloom<B extends BloomBuilderLike>(builder: B, scale = 1): B {
  const node = builder.toJSON() as Record<string, unknown> & { postAuthored?: readonly string[] };
  const authored = node.postAuthored ?? [];
  Object.assign(node, {
    postIntensity: Math.min(4, POST_V2_BLOOM_INTENSITY * scale),
    knee: POST_V2_BLOOM_KNEE,
    clampLuminance: 64,
    postAuthored: [...authored.filter((key) => key !== "intensity" && key !== "knee" && key !== "clampLuminance"), "intensity", "knee", "clampLuminance"]
  });
  return builder;
}
