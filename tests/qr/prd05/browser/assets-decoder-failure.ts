/**
 * PRD-05 05-S3S4 fail-closed page — dedicated minimal harness for the
 * decoder-failure spec. Windows CI: the compressed-glb page's full import
 * graph never evaluated (module fetch deadlock), so this page imports only
 * the decoder APIs the spec asserts on.
 */
import { createAppAssetDecoders, prepareModelDecoders, AssetDecoderUnavailable } from "/packages/engine/src/agent-api/AssetDecoders.js";

declare global {
  interface Window { __QR_READY__?: unknown; __QR_ERROR__?: unknown; __QR_BOOT__?: string }
}

// Eval marker: if the watchdog fires without this, the module never evaluated
// (a transitive import deadlocked); if set, run() hung inside.
window.__QR_BOOT__ = "module-evaluated";

interface DisabledError {
  readonly name: string;
  readonly decoderId: string;
  readonly url: string;
}

const NO_CAPS = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false } as const;

setTimeout(() => {
  if (window.__QR_READY__ === undefined && window.__QR_ERROR__ === undefined) {
    window.__QR_ERROR__ = "page-watchdog: run() still pending after 60s";
  }
}, 60_000);

async function run(): Promise<void> {
  const registry = createAppAssetDecoders(
    { decoders: { draco: false, basePath: "/aura-decoders/" } },
    NO_CAPS,
    { maxTextureSize: 4096 }
  );
  let disabledDracoError: DisabledError | null = null;
  try {
    await prepareModelDecoders({ url: "/fixtures/asset-corpus/damaged-helmet-draco.glb", format: "glb" }, registry);
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
