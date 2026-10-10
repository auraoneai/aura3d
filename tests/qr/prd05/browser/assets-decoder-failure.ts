/**
 * PRD-05 05-S3S4 fail-closed page — dedicated minimal harness for the
 * decoder-failure spec. Imports assets-package source only: the engine
 * barrel deadlocks the dev-server esbuild bundle on Windows runners.
 *
 * Contract exercised: `createAssetDecoderRegistry().require(["draco"])`
 * against a blocked basePath (the same mechanism a missing
 * `/aura-decoders/draco/` produces in production) must reject with a named
 * `AssetDecoderUnavailable`, never a silent load. Browser context cannot
 * fall back to the vendored node-FS path, so the 404 is terminal.
 */
import { AssetDecoderUnavailable, createAssetDecoderRegistry } from "/packages/assets/src/AssetDecoderRegistry.js";

declare global {
  interface Window { __QR_READY__?: unknown; __QR_ERROR__?: unknown; __QR_BOOT__?: string }
}

// Eval marker: if the watchdog fires without this, the module never evaluated.
window.__QR_BOOT__ = "module-evaluated";

interface DisabledError {
  readonly name: string;
  readonly decoderId: string;
  readonly url: string;
}

async function run(): Promise<void> {
  const registry = createAssetDecoderRegistry({
    basePath: "/aura-decoders-blocked/",
    capabilities: { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false },
    maxTextureSize: 4096,
    workerCount: 1
  });
  let disabledDracoError: DisabledError | null = null;
  try {
    await registry.require(["draco"]);
  } catch (error) {
    disabledDracoError = error instanceof AssetDecoderUnavailable
      ? { name: "AssetDecoderUnavailable", decoderId: error.decoderId, url: error.url }
      : { name: error instanceof Error ? error.constructor.name : "unknown", decoderId: "", url: String(error) };
  }
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const offOrigin = resources.map((r) => r.name).filter((n) => !n.startsWith(location.origin) && !n.startsWith("blob:"));
  window.__QR_READY__ = {
    disabledDracoError,
    resourceCount: resources.length,
    sameOriginResources: offOrigin.length === 0,
    offOriginResources: offOrigin
  };
}

run().catch((error: unknown) => {
  window.__QR_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error);
});
export {};
