/**
 * S5-WP19-04 defect: the Khronos MaterialsVariantsShoe names all three
 * KHR_materials_variants materials "phong1SG". The runtime material library,
 * variant mappings and renderable material keys are name-keyed, so the three
 * variants collapsed into one material. Materials are now identified by glTF
 * index (repeated names are made unique), and each variant must bind its own
 * distinct material with its own base color texture.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "../../../../packages/assets/src";
import { createTypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { Material } from "../../../../packages/rendering/src/Material";

const SHOE = "fixtures/asset-corpus/materials-variants-shoe.glb";
const DATA_URL = `data:model/gltf-binary;base64,${readFileSync(SHOE).toString("base64")}`;
const imageDecoder = () => ({ width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(180), colorSpace: "srgb" as const });

/** The fixture's own variant table: variant index -> glTF material index, and each material's base color texture. */
function fixtureVariantTable(): { variants: string[]; materialFor: number[]; textureFor: number[]; authoredNames: string[] } {
  const glb = readFileSync(SHOE);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  const variants = json.extensions.KHR_materials_variants.variants.map((variant: { name: string }) => variant.name);
  const materialFor: number[] = [];
  for (const mapping of json.meshes[0].primitives[0].extensions.KHR_materials_variants.mappings) {
    for (const variant of mapping.variants) materialFor[variant] = mapping.material;
  }
  return {
    variants,
    materialFor,
    textureFor: json.materials.map((material: { pbrMetallicRoughness: { baseColorTexture: { index: number } } }) => material.pbrMetallicRoughness.baseColorTexture.index),
    authoredNames: json.materials.map((material: { name: string }) => material.name)
  };
}

afterEach(() => setTypedGLBActorQrFlags(resolveQrFlags({ options: { A3D_QR_MATERIALS: false } })));

describe("KHR_materials_variants on the Khronos MaterialsVariantsShoe", () => {
  it("the committed fixture really shares one material name across distinct variant materials", () => {
    const table = fixtureVariantTable();
    expect(table.variants).toEqual(["midnight", "beach", "street"]);
    expect(new Set(table.authoredNames).size).toBe(1);
    expect(new Set(table.materialFor).size).toBe(3);
    expect(new Set(table.materialFor.map((material) => table.textureFor[material])).size).toBe(3);
  });

  it("the loader keys each variant mapping to its own uniquely named material", async () => {
    const table = fixtureVariantTable();
    const asset = await new GLTFLoader().load({ url: DATA_URL, type: "gltf" }, new LoadContext());
    expect(new Set(asset.materials.map((material) => material.name)).size).toBe(asset.materials.length);
    // The first use keeps the authored name; repeats record it as sourceName.
    expect(asset.materials[0]!.name).toBe("phong1SG");
    expect(asset.materials[0]!.sourceName).toBeUndefined();
    for (const material of asset.materials.slice(1)) expect(material.sourceName).toBe("phong1SG");
    const mesh = asset.meshes[0]!;
    expect(mesh.materialVariants.map((mapping) => mapping.variant)).toEqual(table.variants);
    for (const mapping of mesh.materialVariants) {
      const index = table.materialFor[mapping.variantIndex]!;
      expect(mapping.materialIndex).toBe(index);
      expect(mapping.material).toBe(asset.materials[index]!.name);
      // A name lookup (what the runtime library does) finds exactly this material.
      expect(asset.materials.filter((material) => material.name === mapping.material)).toEqual([asset.materials[index]]);
    }
    const textures = mesh.materialVariants.map((mapping) => asset.materials[mapping.materialIndex]!.baseColorTexture?.texture);
    expect(new Set(textures).size).toBe(3);
  });

  it("selecting each variant on a typed GLB actor binds a distinct runtime material", async () => {
    setTypedGLBActorQrFlags(resolveQrFlags({ options: { A3D_QR_MATERIALS: true } }));
    const actor = await createTypedGLBActor({ id: "variants-shoe-distinct", asset: { url: DATA_URL }, width: 64, height: 64, imageDecoder });
    try {
      const table = fixtureVariantTable();
      expect([...actor.materialVariants()].sort()).toEqual([...table.variants].sort());
      const bound: Array<{ key: string; material: Material }> = [];
      for (const variant of table.variants) {
        expect(await actor.setMaterialVariant(variant)).toBe("applied");
        const renderables = actor.pipeline.resources.scene.collectRenderables();
        expect(renderables).toHaveLength(1);
        const key = renderables[0]!.renderable.material;
        const material = actor.pipeline.resources.materialLibrary.get(key);
        expect(material, `${variant} runtime material`).toBeDefined();
        bound.push({ key, material: material! });
      }
      expect(new Set(bound.map((entry) => entry.key)).size).toBe(3);
      expect(new Set(bound.map((entry) => entry.material)).size).toBe(3);
      const baseColorTextures = bound.map(({ material }) => material.getParameter("u_baseColorTexture") ?? material.getParameter("u_baseColorMap"));
      expect(baseColorTextures.every((texture) => texture !== undefined)).toBe(true);
      expect(new Set(baseColorTextures).size).toBe(3);
    } finally {
      actor.dispose();
    }
  });
});
