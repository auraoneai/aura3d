import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext, createGLTFRenderResources } from "../../../../packages/assets/src";
import type { GLTFAsset, GLTFRenderResourceOptions } from "../../../../packages/assets/src";
import type { Material } from "../../../../packages/rendering/src";

const COMPARE_TRANSMISSION_GLB = "fixtures/asset-corpus/compare-transmission.glb";

async function loadAsset(file: string): Promise<GLTFAsset> {
  return new GLTFLoader().load(
    { url: `data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`, type: "gltf" },
    new LoadContext()
  );
}

async function materialsFor(asset: GLTFAsset, options: GLTFRenderResourceOptions): Promise<Map<string, Material>> {
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array(4).fill(255), colorSpace: "srgb" }),
    ...options
  });
  return new Map(resources.materialLibrary);
}

describe("gltf material mapping spec-exact (CompareTransmission)", () => {
  it("keeps the real transmission path under the P4-3 gate (flags + env mode)", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true,
      materialsTransmission: true,
      transmission: "env"
    });
    const transmission = materials.get("glTF Transmission")!;

    // Generated-path material keeps authored transmission: no unbacked-scalar rewrite —
    // no cullBack, no dark baseColor fallback, factor and fallback energy stay authored.
    expect(transmission.getParameter("u_transmissionFactor")).toBe(1);
    expect(transmission.getParameter("u_transmissionFallbackEnergy")).toBe(0.08);
    expect(transmission.getParameter("u_baseColor")).toEqual([1, 1, 1, 1]);
    expect(transmission.renderState.blend).toBe(false); // scalar transmission renders in the transmission queue, not blend

    const alpha = materials.get("glTF Alpha")!;
    expect(alpha.renderState.blend).toBe(true);
    expect(alpha.renderState.depthWrite).toBe(false);

    const gold = materials.get("gold")!;
    expect(gold.renderState.cullMode).toBe("none"); // doubleSided
    expect((gold.getParameter("u_baseColor") as readonly number[] | undefined)?.[0]).toBeCloseTo(0.8824, 3);
    expect(gold.getParameter("u_roughness")).toBeCloseTo(0.2, 6);
    expect(gold.getParameter("u_metallic")).toBe(1);
  });

  it("still applies the unbacked-scalar rewrite when the QR path is off", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {});
    const transmission = materials.get("glTF Transmission")!;

    // Legacy path: scalar transmission on an OPAQUE material is approximated — dark
    // transmission stand-in color, culled backfaces, zeroed factor and fallback energy.
    expect(transmission.getParameter("u_transmissionFactor")).toBe(0);
    expect(transmission.getParameter("u_transmissionFallbackEnergy")).toBe(0);
    const baseColor = transmission.getParameter("u_baseColor") as readonly number[];
    expect(baseColor[0]).toBeCloseTo(0.028, 3);
  });

  it("keeps the unbacked-scalar rewrite when the sub-flag is off but materialsR185 is on", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), { materialsR185: true });
    const transmission = materials.get("glTF Transmission")!;
    expect(transmission.getParameter("u_transmissionFactor")).toBe(0);
    const baseColor = transmission.getParameter("u_baseColor") as readonly number[];
    expect(baseColor[0]).toBeCloseTo(0.028, 3);
  });

  it("maps metallicRoughness/occlusion texture slots and samplers", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true, materialsTransmission: true, transmission: "env"
    });
    const alpha = materials.get("glTF Alpha")!;
    expect(alpha.getParameter("u_metallicRoughnessTexture")).toBeDefined();
    expect(alpha.getParameter("u_emissiveTexture")).toBeDefined();
    expect(alpha.getParameter("u_emissiveColor")).toEqual([0.25, 0.25, 0.25]);
    const checker = materials.get("checker")!;
    expect(checker.getParameter("u_baseColorTexture")).toBeDefined();
    expect(checker.getParameter("u_metallic")).toBe(0);
  });
});
