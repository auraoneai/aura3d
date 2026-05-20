import { createGLTFRenderResources, GLTFLoader, LoadContext, type DecodedGLTFImage } from "@galileo3d/assets";
import type { ProductAsset, ProductAssetLoadOptions, ProductManifest } from "./ProductTypes";

export async function loadProductAsset(options: ProductAssetLoadOptions): Promise<ProductAsset> {
  const loader = new GLTFLoader();
  const context = new LoadContext();
  const gltf = await loader.load({ url: options.url }, context);
  const manifest = await loadManifest(options, gltf);
  const resources = await createGLTFRenderResources(gltf, nativeImageDecodeAvailable() ? {} : { imageDecoder: fallbackImageDecoder });
  const parts = manifest.parts.length > 0
    ? manifest.parts
    : gltf.meshes.map((mesh) => ({ name: mesh.name, material: mesh.material, shape: "mesh" }));
  const materials = manifest.materials.length > 0
    ? manifest.materials
    : gltf.materials.map((material) => ({
      name: material.name,
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      alphaMode: material.alphaMode
    }));

  return {
    id: manifest.id,
    title: manifest.title,
    category: manifest.category,
    url: options.url,
    manifest,
    gltf,
    resources,
    parts,
    materials
  };
}

function nativeImageDecodeAvailable(): boolean {
  return typeof createImageBitmap === "function" || typeof globalThis.Image === "function";
}

function fallbackImageDecoder(): DecodedGLTFImage {
  return {
    width: 1,
    height: 1,
    colorSpace: "srgb",
    data: new Uint8Array([220, 220, 220, 255])
  };
}

async function loadManifest(options: ProductAssetLoadOptions, gltf: Awaited<ReturnType<GLTFLoader["load"]>>): Promise<ProductManifest> {
  const manifestUrl = options.manifestUrl ?? options.url.replace(/\/[^/]+\.gltf(?:\?.*)?$/i, "/manifest.json");
  if (typeof fetch === "function") {
    const response = await fetch(manifestUrl);
    if (response.ok) {
      const manifest = await response.json() as ProductManifest;
      return normalizeManifest(manifest, options);
    }
  }
  return normalizeManifest({
    schema: "g3d-product-manifest/fallback",
    id: options.id ?? "product",
    title: options.title ?? gltf.scenes[gltf.defaultScene]?.name ?? "Product",
    category: options.category ?? "product",
    gltf: options.url,
    parts: gltf.meshes.map((mesh) => ({ name: mesh.name, material: mesh.material, shape: "mesh" })),
    materials: gltf.materials.map((material) => ({
      name: material.name,
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      alphaMode: material.alphaMode
    }))
  }, options);
}

function normalizeManifest(manifest: ProductManifest, options: ProductAssetLoadOptions): ProductManifest {
  return {
    ...manifest,
    id: options.id ?? manifest.id,
    title: options.title ?? manifest.title,
    category: options.category ?? manifest.category,
    gltf: manifest.gltf ?? options.url,
    parts: manifest.parts ?? [],
    materials: manifest.materials ?? []
  };
}
