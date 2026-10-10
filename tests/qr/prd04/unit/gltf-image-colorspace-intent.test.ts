/**
 * imageColorSpaceIntent (PRD-04 §14, P5-1): material slot usage decides the
 * colour-space intent fed into the C-16 decode options — sRGB for baseColor/
 * emissive slots, linear for normal/MR/occlusion — and an image used as both
 * reports a `colorspace-conflict` and resolves linear.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext } from "../../../../packages/assets/src";
import type { GLTFAsset } from "../../../../packages/assets/src";
import {
  createGLTFRenderResources,
  imageColorSpaceIntent
} from "../../../../packages/assets/src/GLTFRenderResources";

const DAMAGED_HELMET = "fixtures/asset-corpus/damaged-helmet.glb";

async function loadAsset(file: string): Promise<GLTFAsset> {
  return new GLTFLoader().load(
    { url: `data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`, type: "gltf" },
    new LoadContext()
  );
}

function imageIndexFor(asset: GLTFAsset, slot: "baseColorTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture" | "emissiveTexture"): number {
  const material = asset.materials.find((m) => m[slot]);
  expect(material, `DamagedHelmet has a ${slot} material`).toBeTruthy();
  return material![slot]!.image;
}

describe("imageColorSpaceIntent (P5-1)", () => {
  it("maps DamagedHelmet slots: baseColor/emissive sRGB, normal/MR/occlusion linear", async () => {
    const asset = await loadAsset(DAMAGED_HELMET);
    const { intent, conflicts } = imageColorSpaceIntent(asset);
    expect(conflicts).toHaveLength(0);
    expect(intent.get(imageIndexFor(asset, "baseColorTexture"))).toBe("srgb");
    expect(intent.get(imageIndexFor(asset, "emissiveTexture"))).toBe("srgb");
    expect(intent.get(imageIndexFor(asset, "normalTexture"))).toBe("linear");
    expect(intent.get(imageIndexFor(asset, "metallicRoughnessTexture"))).toBe("linear");
    expect(intent.get(imageIndexFor(asset, "occlusionTexture"))).toBe("linear");
  });

  it("reports colorspace-conflict and resolves linear when one image is both sRGB and linear", async () => {
    const asset = await loadAsset(DAMAGED_HELMET);
    const shared = asset.materials.find((m) => m.baseColorTexture)!.baseColorTexture!.image;
    const mutated: GLTFAsset = {
      ...asset,
      materials: asset.materials.map((material, index) => index === 0
        ? {
            ...material,
            // Re-point the occlusion slot at the baseColor image to force dual usage.
            occlusionTexture: { ...material.occlusionTexture!, image: shared }
          }
        : material)
    };
    const { intent, conflicts } = imageColorSpaceIntent(mutated);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.image).toBe(shared);
    expect(intent.get(shared)).toBe("linear");
  });

  it("surfaces the conflict as a loadIssue on createGLTFRenderResources", async () => {
    const asset = await loadAsset(DAMAGED_HELMET);
    const shared = asset.materials.find((m) => m.baseColorTexture)!.baseColorTexture!.image;
    const mutated: GLTFAsset = {
      ...asset,
      materials: asset.materials.map((material, index) => index === 0
        ? { ...material, occlusionTexture: { ...material.occlusionTexture!, image: shared } }
        : material)
    };
    const resources = await createGLTFRenderResources(mutated, {
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array(4).fill(255), colorSpace: "srgb" })
    });
    const issues = resources.loadIssues.filter((issue) => issue.code === "colorspace-conflict");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail).toContain(`image ${shared}`);
    resources.dispose();
  });
});

describe("tangent-derivative-fallback (P5-4)", () => {
  it("fires only when a normal-mapped mesh has no tangent attribute (no set-0 UVs)", async () => {
    const asset = await loadAsset(DAMAGED_HELMET);
    // The derivative-frame case: the material's textures all sample TEXCOORD_1 while the mesh
    // has no set-0 UVs — the vertex format drops the tangent attribute and the generated
    // program must compute the frame in the fragment shader.
    const retarget = (info: { readonly texCoord: number } | undefined) => info ? { ...info, texCoord: 1 } : info;
    const noSet0: GLTFAsset = {
      ...asset,
      meshes: asset.meshes.map((mesh) => ({
        ...mesh,
        texcoords: [],
        texcoordSets: [[], mesh.texcoordSets[0] ?? mesh.texcoords]
      })),
      materials: asset.materials.map((material) => ({
        ...material,
        baseColorTexture: retarget(material.baseColorTexture),
        metallicRoughnessTexture: retarget(material.metallicRoughnessTexture),
        normalTexture: retarget(material.normalTexture),
        occlusionTexture: retarget(material.occlusionTexture),
        emissiveTexture: retarget(material.emissiveTexture)
      })) as unknown as GLTFAsset["materials"]
    };
    const decoder = () => ({ width: 1, height: 1, data: new Uint8Array(4).fill(255), colorSpace: "srgb" as const });
    const flagged = await createGLTFRenderResources(noSet0, { materialsR185: true, imageDecoder: decoder });
    expect(flagged.loadIssues.filter((i) => i.code === "tangent-derivative-fallback").length).toBeGreaterThan(0);
    flagged.dispose();

    // Same mesh, flag off: the issue is a lane signal only.
    const unflagged = await createGLTFRenderResources(noSet0, { imageDecoder: decoder });
    expect(unflagged.loadIssues.filter((i) => i.code === "tangent-derivative-fallback")).toHaveLength(0);
    unflagged.dispose();

    // Flag on with UVs present: tangents are generated, program uses the generated frame.
    const withUvs = await createGLTFRenderResources(asset, { materialsR185: true, imageDecoder: decoder });
    expect(withUvs.loadIssues.filter((i) => i.code === "tangent-derivative-fallback")).toHaveLength(0);
    withUvs.dispose();
  });
});
