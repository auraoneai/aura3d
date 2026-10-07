/**
 * Lane prd05 barrel — owned by lane 05 (CONTRACTS.md §3.8).
 *
 * Provides the real C-16 implementation onto `resolveCompressedTextureFormatSlot`
 * at import time (the package index re-exports `lanes/index.js`). Providing is
 * unconditional: `ContractSlot.get(flags)` serves the stub unless
 * `A3D_QR_ASSETS` is on, so flag-off behaviour is unchanged automatically.
 */
import { resolveCompressedTextureFormatSlot } from "../contracts/textureFormats.js";
import { probeCompressedTextureCapabilities, resolveCompressedTextureFormatReal } from "../webgl2/TextureFormats.js";
import { registerShaderChunk, registerShaderFeature } from "../contracts/program.js";
import { registerDepthVariantFeature } from "../contracts/shadows.js";
import {
  lodDitherParsChunk,
  lodDitherDiscardChunk,
  lodDitherFeature,
  lodDitherDepthFeature
} from "../shaders/lod-dither.glsl.js";
import {
  debugViewParsChunk,
  debugViewEndChunk,
  debugViewFeature
} from "../shaders/debug-view.glsl.js";

resolveCompressedTextureFormatSlot().provide(resolveCompressedTextureFormatReal);

// PRD-05 §6.3.8 — `a3d_prd05_lod_dither` chunks + forward/depth features.
// Registration is inert while `A3D_QR_ASSETS_LOD` is off; the feature only
// selects draws that carry `RenderItem.lodFade`.
registerShaderChunk(lodDitherParsChunk);
registerShaderChunk(lodDitherDiscardChunk);
registerShaderFeature(lodDitherFeature);
registerDepthVariantFeature(lodDitherDepthFeature);

// PRD-05 §6.7/§8 item 4 — look-dev debug views (texel density, mip level,
// facet, LOD level). Inert while `A3D_QR_ASSETS_LOOKDEV` is off; the feature
// only selects draws whose material carries `u_prd05DebugView`.
registerShaderChunk(debugViewParsChunk);
registerShaderChunk(debugViewEndChunk);
registerShaderFeature(debugViewFeature);

export { probeCompressedTextureCapabilities, resolveCompressedTextureFormatReal } from "../webgl2/TextureFormats.js";
export { resolveCompressedTextureFormatSlot } from "../contracts/textureFormats.js";
export type { CompressedTextureCapabilities } from "../contracts/textureFormats.js";
