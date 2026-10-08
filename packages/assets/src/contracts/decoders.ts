/**
 * C-16 — KTX2 target format and decoder registry (CONTRACTS.md). Provider: PRD 05.
 * Flag: A3D_QR_ASSETS. Implementations live in ../KTX2TargetSelection.ts and
 * ../AssetDecoderRegistry.ts (Phase-1 fill).
 */

export { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "../KTX2TargetSelection.js";
export {
  AssetDecoderUnavailable,
  createAssetDecoderRegistry,
  type AssetDecoderId,
  type AssetDecoderRegistry,
  type AssetDecoderRegistryDiagnostics,
  type AssetDecoderRegistryOptions,
  type AuraAssetDecoderSet
} from "../AssetDecoderRegistry.js";
import type { KTX2BasisTargetFormat } from "../KTX2TargetSelection.js";

export interface KTX2BasisTextureTranscoderOptions { readonly targetFormat: KTX2BasisTargetFormat; readonly colorSpace: "srgb" | "linear"; readonly maxDimension?: number; readonly transcoderUrl: string; }  // same-origin, default "/aura-decoders/basis/"
