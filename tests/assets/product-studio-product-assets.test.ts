import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "@galileo3d/assets";

const PRODUCTS = ["camera-kit", "speaker", "watch"] as const;
const ROOT = join(process.cwd(), "fixtures", "v2", "products");
const REQUIRED_SLOTS = ["base-color", "metallic-roughness", "normal", "emissive"] as const;

describe("V2 product assets", () => {
  it.each(PRODUCTS)("ships a real product glTF fixture for %s", async (id) => {
    const gltfJson = readJson(join(ROOT, id, `${id}.gltf`));
    const manifest = readJson(join(ROOT, id, "manifest.json"));
    const asset = await new GLTFLoader().load({ url: jsonDataUri(gltfJson) }, new LoadContext());

    expect(manifest.schema).toBe("g3d-v2-product-manifest/v1");
    expect(manifest.id).toBe(id);
    expect(asset.meshes.length).toBeGreaterThanOrEqual(8);
    expect(asset.materials.length).toBeGreaterThanOrEqual(3);
    expect(asset.textures.length).toBeGreaterThanOrEqual(asset.materials.length * 4);
    expect(asset.images.length).toBeGreaterThanOrEqual(asset.materials.length * 4);
    expect(asset.meshes.map((mesh) => mesh.name)).toEqual(expect.arrayContaining(manifest.parts.map((part: { name: string }) => part.name)));
    expect(asset.loaderDiagnostics.textureSlots).toEqual(expect.arrayContaining(REQUIRED_SLOTS));
    expect(manifest.requirements.materialTextureSlots).toEqual(expect.arrayContaining(["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture"]));
    expect(manifest.rejectedInputs).toEqual(expect.arrayContaining([
      "tests/reports/legacy-product-viewer/product-viewer.png",
      "tests/reports/legacy-material-studio/material-studio.png",
      "tests/reports/legacy-asset-viewer/asset-viewer.png",
      "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
    ]));
  });
});

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function jsonDataUri(json: unknown): string {
  return `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`;
}
