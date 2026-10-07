/**
 * Lane prd05 barrel — owned by lane 05 (CONTRACTS.md §3.8).
 *
 * C-16 Phase-1 surface: the real decoder registry + KTX2 target selection +
 * vendored-transcoder pipeline. All consumers decide activation through the
 * forwarded `A3D_QR_ASSETS`/`A3D_QR_ASSETS_DECODERS` option flags; importing
 * this barrel changes no behaviour by itself.
 */
export {
  AssetDecoderUnavailable,
  createAssetDecoderRegistry,
  probeKTX2Header,
  type AssetDecoderId,
  type AssetDecoderRegistry,
  type AssetDecoderRegistryDiagnostics,
  type AssetDecoderRegistryOptions,
  type AuraAssetDecoderSet
} from "../AssetDecoderRegistry.js";
export { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "../KTX2TargetSelection.js";
export {
  ensureCompressedTextureSupport,
  loadBasisTranscoderModule,
  transcodeKTX2BasisTexture,
  type CompressedTextureDecoderProbes,
  type CompressedTextureDecoderStatus,
  type CompressedTextureSupportDiagnostics,
  type CompressedTextureSupportRequest,
  type KTX2BasisTextureTranscoderOptions,
  type KTX2BasisTranscodedTexture
} from "../KTX2BasisTextureTranscoder.js";
export { basisTranscoderFormat, transcodeKTX2Levels, BASIS_TRANSCODER_FORMAT } from "../KTX2TranscodeDriver.js";
export { createKTX2TranscodeWorkerPool, type KTX2TranscodeWorkerPool } from "../KTX2TranscodeWorker.js";
