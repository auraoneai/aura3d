/**
 * C-16 §7.4 — AssetDecoderRegistry (PRD-05 Phase 1).
 *
 * One registry per app. `require(ids)` lazy-loads the named decoders
 * same-origin from `options.basePath` ("aura-decoders/"):
 *   - meshopt → `import("meshoptimizer")` (npm package), `MeshoptDecoder.ready`
 *   - draco   → `${basePath}draco/` vendored UMD, only on `require(["draco"])`
 *   - ktx2    → `${basePath}basis/` vendored Basis transcoder + a real
 *               `GLTFImageDecoder` that transcodes via `selectKTX2TargetFormat`
 * `diagnostics()` reports `{loaded, failed}`; after one retry a missing
 * decoder throws `AssetDecoderUnavailable`; `dispose()` frees handles.
 */

import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import { createMeshoptDecoder, createDracoDecoder, type GLTFMeshoptDecoderModule, type GLTFDracoDecoderModule } from "./GLTFCompressionDecoders.js";
import { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "./KTX2TargetSelection.js";
import { loadBasisTranscoderModule, transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder.js";
import { decodeImageInBrowser, isKTX2BasisImage, readImageBytes } from "./gltf/ImageDecode.js";
import { read as readKtx2Container, KHR_DF_MODEL_UASTC, KHR_DF_TRANSFER_SRGB } from "ktx-parse";
import type { DecodedGLTFImage, GLTFImageDecoder } from "./GLTFRenderResources.js";
import type { GLTFAsset, GLTFImageAsset } from "./GLTFLoader.js";

export type { KTX2BasisTargetFormat };

export type AssetDecoderId = "meshopt" | "draco" | "ktx2";

export interface AuraAssetDecoderSet {
  readonly meshopt?: ReturnType<typeof createMeshoptDecoder>;
  readonly draco?: ReturnType<typeof createDracoDecoder>;
  readonly imageDecoder?: GLTFImageDecoder;
}

export interface AssetDecoderRegistryDiagnostics {
  readonly loaded: readonly AssetDecoderId[];
  readonly failed: readonly { id: string; url: string }[];
}

export interface AssetDecoderRegistry {
  require(decoders: readonly AssetDecoderId[]): Promise<AuraAssetDecoderSet>;
  diagnostics(): AssetDecoderRegistryDiagnostics;
  dispose(): void;
}

export class AssetDecoderUnavailable extends Error {
  public readonly decoderId: string;
  public readonly url: string;
  constructor(decoderId: string, url: string) {
    super(`AssetDecoderUnavailable:${decoderId}:${url}`);
    this.name = "AssetDecoderUnavailable";
    this.decoderId = decoderId;
    this.url = url;
  }
}

export interface AssetDecoderRegistryOptions {
  /** Same-origin decoder root, e.g. `/aura-decoders/` (trailing slash optional). */
  readonly basePath: string;
  readonly capabilities: CompressedTextureCapabilities;
  readonly maxTextureSize: number;
  readonly workerCount: number;
}

interface KTX2HeaderProbe {
  readonly source: "uastc" | "etc1s";
  readonly hasAlpha: boolean;
  readonly colorSpace: "srgb" | "linear";
}

/** Reads the KTX2 container header (DFD colorModel/transfer/samples) with ktx-parse. */
export function probeKTX2Header(bytes: Uint8Array): KTX2HeaderProbe {
  const container = readKtx2Container(bytes);
  const dfd = container.dataFormatDescriptor?.[0];
  const source = dfd?.colorModel === KHR_DF_MODEL_UASTC ? "uastc" : "etc1s";
  // ETC1S carries alpha in a second DFD sample; UASTC alpha is irrelevant to
  // target selection (all UASTC targets are RGBA-capable).
  const hasAlpha = source === "etc1s" ? (dfd?.samples?.length ?? 1) > 1 : true;
  return { source, hasAlpha, colorSpace: dfd?.transferFunction === KHR_DF_TRANSFER_SRGB ? "srgb" : "linear" };
}

export function createAssetDecoderRegistry(options: AssetDecoderRegistryOptions): AssetDecoderRegistry {
  const basePath = options.basePath.endsWith("/") ? options.basePath : `${options.basePath}/`;
  const loaded = new Set<AssetDecoderId>();
  const failed: { id: string; url: string }[] = [];
  // Per-decoder promise cache: repeated require() calls reuse the in-flight
  // or resolved decoder (lazy-load exactly once per registry).
  const decoderPromises = new Map<AssetDecoderId, Promise<unknown>>();
  let disposed = false;

  const withRetry = async <T>(id: AssetDecoderId, url: string, load: () => Promise<T>): Promise<T> => {
    if (disposed) throw new AssetDecoderUnavailable(id, url);
    try {
      const value = await load();
      loaded.add(id);
      return value;
    } catch {
      // One retry, then AssetDecoderUnavailable.
      try {
        const value = await load();
        loaded.add(id);
        return value;
      } catch {
        failed.push({ id, url });
        throw new AssetDecoderUnavailable(id, url);
      }
    }
  };

  const loadMeshopt = (): Promise<ReturnType<typeof createMeshoptDecoder>> =>
    withRetry("meshopt", "meshoptimizer", async () => {
      const mod = await import("meshoptimizer") as Record<string, unknown>;
      const decoder = (mod.MeshoptDecoder ?? (mod.default as Record<string, unknown> | undefined)?.MeshoptDecoder) as GLTFMeshoptDecoderModule | undefined;
      if (!decoder) throw new Error("meshoptimizer package did not export MeshoptDecoder");
      if (decoder.ready) await decoder.ready;
      return createMeshoptDecoder(decoder);
    });

  const loadDraco = (): Promise<ReturnType<typeof createDracoDecoder>> =>
    withRetry("draco", `${basePath}draco/draco_decoder.js`, async () => {
      const factory = await loadUmdGlobal("draco", `${basePath}draco/`, "draco_decoder.js", "DracoDecoderModule");
      const instance = await (factory as (config?: Record<string, unknown>) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule)({});
      if (instance && typeof instance === "object" && "ready" in instance) {
        await (instance as { ready: PromiseLike<unknown> }).ready;
      }
      return createDracoDecoder(instance as GLTFDracoDecoderModule);
    });

  const buildKtx2ImageDecoder = async (): Promise<GLTFImageDecoder> => {
    const transcoderUrl = `${basePath}basis/`;
    // Warm/verify the vendored transcoder (worker pool fetches its own copy;
    // this also covers non-Worker environments where the module is shared).
    await withRetry("ktx2", `${transcoderUrl}basis_transcoder.js`, () => loadBasisTranscoderModule(transcoderUrl).then(() => undefined));
    loaded.add("ktx2");
    return async (image: GLTFImageAsset, imageIndex: number, asset: GLTFAsset): Promise<DecodedGLTFImage> => {
      if (!isKTX2BasisImage(image)) {
        return decodeImageInBrowser(image, imageIndex, asset, { maxTextureSize: options.maxTextureSize, qrAssets: true });
      }
      const bytes = new Uint8Array(await readImageBytes(asset, image));
      const header = probeKTX2Header(bytes);
      const targetFormat = selectKTX2TargetFormat(options.capabilities, header.source, header.hasAlpha, header.colorSpace);
      const decoded = await transcodeKTX2BasisTexture(bytes, {
        targetFormat,
        colorSpace: header.colorSpace,
        maxDimension: options.maxTextureSize,
        transcoderUrl,
        workerCount: options.workerCount
      });
      return decoded;
    };
  };

  return {
    async require(decoders: readonly AssetDecoderId[]): Promise<AuraAssetDecoderSet> {
      if (decoders.length === 0) return {};
      const set: { meshopt?: ReturnType<typeof createMeshoptDecoder>; draco?: ReturnType<typeof createDracoDecoder>; imageDecoder?: GLTFImageDecoder } = {};
      for (const decoder of decoders) {
        if (disposed) throw new AssetDecoderUnavailable(decoder, basePath);
        let promise = decoderPromises.get(decoder);
        if (!promise) {
          promise = decoder === "meshopt" ? loadMeshopt() : decoder === "draco" ? loadDraco() : buildKtx2ImageDecoder();
          decoderPromises.set(decoder, promise);
        }
        if (decoder === "meshopt") set.meshopt = (await promise) as ReturnType<typeof createMeshoptDecoder>;
        else if (decoder === "draco") set.draco = (await promise) as ReturnType<typeof createDracoDecoder>;
        else if (decoder === "ktx2") set.imageDecoder = (await promise) as GLTFImageDecoder;
      }
      return set;
    },
    diagnostics(): AssetDecoderRegistryDiagnostics {
      return { loaded: [...loaded], failed: [...failed] };
    },
    dispose(): void {
      disposed = true;
      loaded.clear();
      decoderPromises.clear();
    }
  };
}

/** UMD decoder bundles bind a global only under a classic `<script>` load. */
async function loadUmdGlobal(id: AssetDecoderId, dirUrl: string, fileName: string, globalName: string): Promise<unknown> {
  const url = `${dirUrl}${fileName}`;
  if (typeof document === "undefined") {
    // Node/tests: evaluate the vendored UMD copy as CJS.
    const [{ readFileSync, existsSync }, { createRequire }, { fileURLToPath }, { dirname }] = await Promise.all([
      import("node:fs"), import("node:module"), import("node:url"), import("node:path")
    ]);
    const require2 = createRequire(import.meta.url);
    const candidates = [
      new URL(`../vendor/${id === "draco" ? "draco" : "basis"}/${fileName}`, import.meta.url),
      new URL(`../../vendor/${id === "draco" ? "draco" : "basis"}/${fileName}`, import.meta.url)
    ];
    const fileUrl = candidates.find((candidate) => existsSync(candidate));
    if (!fileUrl) throw new Error(`vendored ${fileName} not found next to @aura3d/assets`);
    const filePath = fileURLToPath(fileUrl);
    const code = readFileSync(fileUrl, "utf8");
    const box: { exports: Record<string, unknown> } = { exports: {} };
    new Function("module", "exports", "require", "__dirname", "__filename", code)(box, box.exports, require2, dirname(filePath), filePath);
    const bound = box.exports[globalName] ?? box.exports.default ?? box.exports;
    if (bound === undefined || (typeof bound !== "function" && typeof bound !== "object")) {
      throw new Error(`${globalName} not bound by vendored ${fileName}`);
    }
    // Emscripten MODULARIZE factories need their wasm binary fed directly.
    if (typeof bound === "function") {
      const wasmFile = fileName.replace(/\.js$/, ".wasm");
      const wasmUrl = new URL(wasmFile, fileUrl);
      return (config?: Record<string, unknown>) => {
        const cfg = { ...config, wasmBinary: existsSync(wasmUrl) ? readFileSync(wasmUrl) : undefined };
        return bound(cfg);
      };
    }
    return bound;
  }
  return new Promise<unknown>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => {
      const bound = (globalThis as Record<string, unknown>)[globalName];
      if (bound === undefined) reject(new Error(`${globalName} not bound by ${url}`));
      else if (typeof bound === "function") {
        // Emscripten MODULARIZE: same-object config/return; wasm via locateFile.
        resolve((config?: Record<string, unknown>) => bound({ ...config, locateFile: (file: string) => `${dirUrl}${file}` }));
      } else resolve(bound);
    };
    script.onerror = () => reject(new Error(`script load failed: ${url}`));
    document.head.appendChild(script);
  });
}


