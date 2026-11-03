import { workerUrlWithAssets, type AuraWorkerAssetUrls } from "@aura3d/core";

/**
 * The published render worker is emitted as a self-contained asset before an
 * application is built, so the application's Vite defines cannot be assumed
 * to reach its contents. Put the build-scoped directory into this worker's
 * own manifest instead, while retaining its other packaged assets.
 */
function decoderAssetsForDeployment(basePath: string, workerUrl: URL): Pick<AuraWorkerAssetUrls,
  "basisScript" | "basisModule" | "basisWasm" | "basisWorker" | "dracoModule" | "dracoWasm" | "meshoptModule"> {
  if (!basePath.startsWith("/") || basePath.startsWith("//") || /[\\?#\u0000-\u001f\u007f]/.test(basePath)) {
    throw new Error("Decoder deployment base must be an absolute same-origin path without a query or fragment");
  }
  const parts = basePath.slice(1).split("/");
  if (parts.at(-1) === "") parts.pop();
  if (parts.some((part) => part === "")) throw new Error("Decoder deployment base contains an empty path segment");
  const segments = parts.map((part) => {
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { throw new Error("Decoder deployment base contains invalid path encoding"); }
    if (decoded === "." || decoded === ".." || /[%/:\\\u0000-\u001f\u007f]/.test(decoded)) {
      throw new Error("Decoder deployment base contains an unsafe path segment");
    }
    return encodeURIComponent(decoded);
  });
  const directory = `/${segments.join("/")}${segments.length ? "/" : ""}`;
  const origin = `${workerUrl.origin}/`;
  const url = (relative: string): string => new URL(`${directory}${relative}`, origin).href;
  return {
    basisScript: url("basis/basis_transcoder.js"),
    basisModule: url("basis/basis_transcoder.mjs"),
    basisWasm: url("basis/basis_transcoder.wasm"),
    basisWorker: url("basis/ktx2.worker.js"),
    dracoModule: url("draco/draco_decoder.mjs"),
    dracoWasm: url("draco/draco_decoder.wasm"),
    meshoptModule: url("meshopt/meshopt_decoder.mjs")
  };
}

/**
 * Release-only factory. Finalization installs this module at workerFactory.js
 * after emitting the self-contained worker and its assets beside it. Each URL
 * stays statically visible to application bundlers, which can copy and hash
 * the assets without compiling the worker as an IIFE.
 */
export function workerRendererUrl(): URL {
  const assets: AuraWorkerAssetUrls = {
    vfx1024: new URL("./worker-assets/aura-vfx-1k.png?no-inline", import.meta.url).href,
    vfx2048: new URL("./worker-assets/aura-vfx-2k.png?no-inline", import.meta.url).href,
    humanoid: new URL("./worker-assets/humanoid-fixture.glb?no-inline", import.meta.url).href,
    retargetWorker: new URL("./worker-assets/retarget.worker.bundle.js?no-inline", import.meta.url).href,
    basisScript: new URL("./worker-assets/basis_transcoder.js?no-inline", import.meta.url).href,
    basisModule: new URL("./worker-assets/basis_transcoder.mjs?no-inline", import.meta.url).href,
    basisWasm: new URL("./worker-assets/basis_transcoder.wasm?no-inline", import.meta.url).href,
    basisWorker: new URL("./worker-assets/ktx2.worker.js?no-inline", import.meta.url).href,
    dracoModule: new URL("./worker-assets/draco_decoder.mjs?no-inline", import.meta.url).href,
    dracoWasm: new URL("./worker-assets/draco_decoder.wasm?no-inline", import.meta.url).href,
    meshoptModule: new URL("./worker-assets/meshopt_decoder.mjs?no-inline", import.meta.url).href,
    zstdWorker: new URL("./worker-assets/zstd.worker.bundle.js?no-inline", import.meta.url).href
  };
  const deploymentBase = (import.meta as ImportMeta & { env?: { AURA3D_DECODER_BASE_PATH?: unknown } }).env?.AURA3D_DECODER_BASE_PATH;
  if (deploymentBase !== undefined) {
    if (typeof deploymentBase !== "string") throw new Error("Decoder deployment base must be a path string");
    const workerUrl = new URL("./worker-assets/render.worker.bundle.js?no-inline", import.meta.url);
    // Keep module inspection usable in Node, where workerUrlWithAssets has no
    // browser manifest to encode and import.meta.url can have the file scheme.
    if (workerUrl.protocol !== "file:") Object.assign(assets, decoderAssetsForDeployment(deploymentBase, workerUrl));
  }
  return workerUrlWithAssets(new URL("./worker-assets/render.worker.bundle.js?no-inline", import.meta.url), assets);
}

/** Construct the packaged module worker without transferring the caller's canvas. */
export function createWorkerRendererWorker(): Worker {
  return new Worker(workerRendererUrl(), { type: "module" });
}
