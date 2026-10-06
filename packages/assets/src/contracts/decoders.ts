/**
 * C-16 — KTX2 target format and decoder registry (CONTRACTS.md). Provider: PRD 05.
 * Flag: A3D_QR_ASSETS.
 */

import type { CompressedTextureCapabilities } from "@aura3d/rendering/contracts";
import { createMeshoptDecoder, createDracoDecoder, type GLTFMeshoptDecoderModule, type GLTFDracoDecoderModule } from "../GLTFCompressionDecoders";

export type KTX2BasisTargetFormat = "astc-4x4-rgba-unorm" | "bc7-rgba-unorm" | "etc2-rgba8unorm" | "etc2-rgb8unorm" | "bc3-rgba-unorm" | "bc1-rgb-unorm" | "rgba8";

/**
 * Real (pure): ASTC → BC7 → ETC2 → BC3/BC1 → RGBA8; the etc1s/alpha matrix is
 * `KTX2_BASIS_TARGETS` (ASSET_MATRIX.md §matrix.ktx2).
 */
export function selectKTX2TargetFormat(caps: CompressedTextureCapabilities, source: "uastc" | "etc1s", hasAlpha: boolean, colorSpace: "srgb" | "linear"): KTX2BasisTargetFormat {
  void source;
  void colorSpace;
  if (caps.astc) return "astc-4x4-rgba-unorm";
  if (caps.bptc) return "bc7-rgba-unorm";
  if (caps.etc2) return hasAlpha ? "etc2-rgba8unorm" : "etc2-rgb8unorm";
  if (caps.s3tc || caps.s3tcSrgb) return hasAlpha ? "bc3-rgba-unorm" : "bc1-rgb-unorm";
  return "rgba8";
}

export interface KTX2BasisTextureTranscoderOptions { readonly targetFormat: KTX2BasisTargetFormat; readonly colorSpace: "srgb" | "linear"; readonly maxDimension?: number; readonly transcoderUrl: string; }  // same-origin, default "/aura-decoders/basis/"
export interface AuraAssetDecoderSet { readonly meshopt?: unknown; readonly draco?: unknown; readonly imageDecoder?: unknown; }  // concrete GLTF*Decoder types from GLTFCompressionDecoders.ts
export interface AssetDecoderRegistry { require(decoders: readonly ("meshopt" | "draco" | "ktx2")[]): Promise<AuraAssetDecoderSet>; diagnostics(): { readonly loaded: readonly string[]; readonly failed: readonly { id: string; url: string }[] }; dispose(): void; }
export class AssetDecoderUnavailable extends Error { public readonly decoderId: string; public readonly url: string;
  constructor(decoderId: string, url: string) { super(`AssetDecoderUnavailable:${decoderId}:${url}`); this.name = "AssetDecoderUnavailable"; this.decoderId = decoderId; this.url = url; }
}

/**
 * PR 0a: real registry wrapping `GLTFCompressionDecoders.ts`; decoders lazy-load
 * same-origin from `options.basePath`; `require([])` resolves immediately;
 * failures throw `AssetDecoderUnavailable` after one retry.
 */
export function createAssetDecoderRegistry(options: { readonly basePath: string; readonly capabilities: CompressedTextureCapabilities; readonly maxTextureSize: number; readonly workerCount: number }): AssetDecoderRegistry {
  const basePath = options.basePath.endsWith("/") ? options.basePath : `${options.basePath}/`;
  const loaded: string[] = [];
  const failed: { id: string; url: string }[] = [];
  const cache = new Map<string, Promise<unknown>>();
  let disposed = false;

  const loadModule = async (id: string, url: string): Promise<unknown> => {
    if (disposed) throw new AssetDecoderUnavailable(id, url);
    let attempt = cache.get(id);
    if (!attempt) {
      attempt = (async () => {
        const mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
        return mod;
      })();
      cache.set(id, attempt);
    }
    try {
      const module_ = await attempt;
      if (!loaded.includes(id)) loaded.push(id);
      return module_;
    } catch (error) {
      // One retry, then AssetDecoderUnavailable.
      cache.delete(id);
      try {
        const retry = (async () => (await import(/* @vite-ignore */ url)) as Record<string, unknown>)();
        cache.set(id, retry);
        const module_ = await retry;
        if (!loaded.includes(id)) loaded.push(id);
        return module_;
      } catch {
        failed.push({ id, url });
        throw new AssetDecoderUnavailable(id, url);
      }
    }
  };

  return {
    async require(decoders: readonly ("meshopt" | "draco" | "ktx2")[]): Promise<AuraAssetDecoderSet> {
      const set: { meshopt?: unknown; draco?: unknown; imageDecoder?: unknown } = {};
      for (const decoder of decoders) {
        if (decoder === "meshopt") {
          const mod = (await loadModule("meshopt", `${basePath}meshopt_decoder.js`)) as { MeshoptDecoder?: GLTFMeshoptDecoderModule };
          if (mod.MeshoptDecoder) set.meshopt = createMeshoptDecoder(mod.MeshoptDecoder);
        } else if (decoder === "draco") {
          const mod = (await loadModule("draco", `${basePath}draco_decoder.js`)) as { DracoDecoderModule?: (opts?: unknown) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule };
          if (mod.DracoDecoderModule) {
            const instance = await mod.DracoDecoderModule();
            set.draco = createDracoDecoder(instance as GLTFDracoDecoderModule);
          }
        } else if (decoder === "ktx2") {
          await loadModule("ktx2", `${basePath}basis_transcoder.js`);
          set.imageDecoder = { targetFormat: selectKTX2TargetFormat(options.capabilities, "uastc", true, "srgb") };
        }
      }
      return set;
    },
    diagnostics(): { readonly loaded: readonly string[]; readonly failed: readonly { id: string; url: string }[] } {
      return { loaded: [...loaded], failed: [...failed] };
    },
    dispose(): void {
      disposed = true;
      cache.clear();
    }
  };
}
