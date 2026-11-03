import type { RenderDevice } from "../RenderDevice";

/**
 * A device is trusted for renderer-owned batching only if its entire frame's
 * execution is proven unable to call user code between logical draws. Public
 * device methods and native contexts can currently be replaced or extended, so
 * no backend has that proof yet. Keep logical items until backend attestation
 * and per-draw observer revalidation are available.
 */
export function isTrustedBatchExecutionDevice(_device: RenderDevice): boolean {
  return false;
}
