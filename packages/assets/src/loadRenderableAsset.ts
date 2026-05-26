import { createCanonicalProductSceneRenderKit, type CanonicalProductSceneFixture } from "@aura3d/rendering";
import { GLTFLoader, type GLTFAsset } from "./GLTFLoader";
import { LoadContext, type LoadContextOptions } from "./LoadContext";

export type RenderableAssetKind = "canonical-product-scene" | "gltf";

export interface RenderableAsset {
  readonly kind: RenderableAssetKind;
  readonly url?: string;
  readonly canonical?: CanonicalProductSceneFixture;
  readonly gltf?: GLTFAsset;
  readonly warnings: readonly string[];
}

export interface LoadRenderableAssetOptions extends LoadContextOptions {
  readonly type?: RenderableAssetKind | "auto";
}

export async function loadRenderableAsset(
  urlOrAsset: string | RenderableAsset,
  options: LoadRenderableAssetOptions = {}
): Promise<RenderableAsset> {
  if (typeof urlOrAsset !== "string") {
    return urlOrAsset;
  }
  const type = options.type ?? inferRenderableAssetKind(urlOrAsset);
  if (type === "canonical-product-scene") {
    const manifest = await loadJsonManifest(urlOrAsset);
    const kit = createCanonicalProductSceneRenderKit();
    kit.dispose();
    return {
      kind: "canonical-product-scene",
      url: urlOrAsset,
      canonical: kit.canonical,
      warnings: Array.isArray(manifest.blockedClaims)
        ? [`Blocked claims remain: ${manifest.blockedClaims.join(", ")}`]
        : []
    };
  }
  if (type === "gltf") {
    const gltf = await new GLTFLoader().load({ url: urlOrAsset, type: "gltf" }, new LoadContext(options));
    return {
      kind: "gltf",
      url: urlOrAsset,
      gltf,
      warnings: gltf.loaderDiagnostics.unsupportedExtensions.map((extension) => `Unsupported glTF extension remains blocked: ${extension}`)
    };
  }
  throw new Error(`Unsupported renderable asset type for ${urlOrAsset}`);
}

function inferRenderableAssetKind(url: string): RenderableAssetKind {
  if (/canonical-product-scene\.json(?:\?.*)?$/i.test(url)) return "canonical-product-scene";
  if (/\.(?:gltf|glb)(?:\?.*)?$/i.test(url) || url.startsWith("data:model/gltf")) return "gltf";
  return "canonical-product-scene";
}

async function loadJsonManifest(url: string): Promise<{ readonly blockedClaims?: readonly string[] }> {
  if (typeof fetch !== "function") {
    return {};
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load renderable asset manifest ${url}: ${response.status}`);
  }
  return await response.json() as { readonly blockedClaims?: readonly string[] };
}
