import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader, LoadContext } from "@aura3d/assets";

const root = join(process.cwd(), "fixtures/workflow-assets/assets");
const originalFetch = globalThis.fetch;

describe("V3 glTF loader fixtures", () => {
  afterEach(() => {
    vi.stubGlobal("fetch", originalFetch);
  });

  it("loads V3 .gltf, .glb, data URI, and external buffer/image fixtures", async () => {
    stubFileFetch();
    const loader = new GLTFLoader();
    const context = new LoadContext();
    const gltf = await loader.load({ url: jsonDataUri(readFileSync(join(root, "product-camera/product-camera.gltf"), "utf8")) }, context);
    const glb = await loader.load({ url: binaryDataUri(readFileSync(join(root, "product-camera/product-camera.glb"))) }, context);
    const dataUri = await loader.load({ url: jsonDataUri(readFileSync(join(root, "material-spheres/material-spheres.gltf"), "utf8")) }, context);
    const external = await loader.load({ url: fileUrl(join(root, "product-camera/product-camera-external.gltf")) }, context);

    for (const asset of [gltf, glb, dataUri, external]) {
      expect(asset.loaderDiagnostics.meshCount).toBeGreaterThan(0);
      expect(asset.loaderDiagnostics.materialCount).toBeGreaterThan(0);
      expect(asset.loaderDiagnostics.textureCount).toBeGreaterThan(0);
      expect(asset.loaderDiagnostics.imageCount).toBeGreaterThan(0);
      expect(asset.meshes.every((mesh) => mesh.geometry.vertexCount > 0)).toBe(true);
      expect(asset.materials.some((material) => material.baseColorTexture)).toBe(true);
    }
  });

  it("ships required fixture directories with manifests", () => {
    for (const id of ["product-camera", "material-spheres", "animated-character", "variant-product", "compressed-product"]) {
      const manifest = JSON.parse(readFileSync(join(root, id, "manifest.json"), "utf8"));
      expect(manifest.schema).toBe("a3d-v3-asset-fixture/v1");
      expect(manifest.coverage).toEqual(expect.arrayContaining(["gltf", "glb", "data-uri", "external-buffer", "external-image"]));
      expect(manifest.partCount).toBeGreaterThan(0);
      expect(manifest.materialCount).toBeGreaterThan(0);
    }
  });
});

function fileUrl(path: string): string {
  return new URL(`file://${path}`).href;
}

function jsonDataUri(json: string): string {
  return `data:model/gltf+json;base64,${Buffer.from(json).toString("base64")}`;
}

function binaryDataUri(bytes: Buffer): string {
  return `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
}

function stubFileFetch(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("file://")) {
      return originalFetch(input);
    }
    const path = new URL(url).pathname;
    const body = await readFile(path);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": path.endsWith(".json") || path.endsWith(".gltf") ? "model/gltf+json" : "application/octet-stream"
      }
    });
  });
}
