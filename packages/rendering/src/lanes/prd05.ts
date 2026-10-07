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

resolveCompressedTextureFormatSlot().provide(resolveCompressedTextureFormatReal);

export { probeCompressedTextureCapabilities, resolveCompressedTextureFormatReal } from "../webgl2/TextureFormats.js";
export { resolveCompressedTextureFormatSlot } from "../contracts/textureFormats.js";
export type { CompressedTextureCapabilities } from "../contracts/textureFormats.js";
