import {
  ensureCompressedTextureSupport,
  type CompressedTextureDecoderProbes,
  type CompressedTextureSupportDiagnostics,
  type CompressedTextureSupportRequest,
  type KTX2BasisTargetFormat
} from "@aura3d/assets/browser";

/**
 * Root one-call decoder setup (muse3jsparity-PRD M2).
 *
 * Thin async wrapper over the package-level `ensureCompressedTextureSupport`:
 * draco/meshopt default off, ktx2 defaults on, and every probe defaults to
 * fail-closed (unavailable) unless the route injects real capability probes.
 * Diagnostics report per-decoder status plus the GPU-aware KTX2 target, so a
 * route can assert support before streaming compressed textures instead of
 * discovering a missing decoder mid-load.
 */
export async function ensureAssetDecoders(
  request: CompressedTextureSupportRequest = {},
  probes: CompressedTextureDecoderProbes = {}
): Promise<CompressedTextureSupportDiagnostics> {
  return ensureCompressedTextureSupport(request, probes);
}

export const assets = {
  ensureDecoders: ensureAssetDecoders
} as const;

export type {
  CompressedTextureDecoderProbes,
  CompressedTextureSupportDiagnostics,
  CompressedTextureSupportRequest,
  KTX2BasisTargetFormat
};
