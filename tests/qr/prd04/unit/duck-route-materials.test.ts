/**
 * duck-route-materials.test.ts — PRD-04 P2-13.
 *
 * `apps/wow-webgpu-product-viewer/src/main.ts` no longer clamps loaded materials to the
 * "product display" preset: the `u_productColorSmoothing` write and the
 * roughness≥0.88 / metallic≤0.04 / clearcoat≤0.08 / transmission-zeroing loops are gone.
 * Loading duck.glb through the production pipeline yields the authored glTF factors
 * verbatim — no clamped surface response is introduced anywhere in the chain.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProductionGLTFRenderPipeline } from "../../../../packages/assets/src/asset-corpus";

const MAIN_TS = readFileSync("apps/wow-webgpu-product-viewer/src/main.ts", "utf8");
const DUCK = "fixtures/threejs-parity/assets/physics/duck.glb";

const imageDecoder = () => ({
  width: 4,
  height: 4,
  data: new Uint8Array(4 * 4 * 4).fill(180),
  colorSpace: "srgb" as const
});

function gltfJson(path: string): { materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number } }[] } {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
}

describe("product-viewer material clamps removed (P2-13)", () => {
  it("main.ts writes no product-smoothing or transmission-zeroing uniforms", () => {
    for (const uniform of [
      "u_productColorSmoothing",
      "u_transmissionFactor",
      "u_transmissionTextureEnabled",
      "u_diffuseTransmissionFactor",
      "u_transmissionFallbackEnergy",
      "u_transmissionParallaxStrength",
      "u_transmissionBounceCount",
      "u_transmissionCausticStrength"
    ]) {
      expect(MAIN_TS, uniform).not.toContain(`setParameter("${uniform}"`);
    }
    expect(MAIN_TS).not.toMatch(/Math\.(min|max)\(0\.88/); // roughness floor clamp
    expect(MAIN_TS).not.toMatch(/Math\.(min|max)\(0\.04/); // metallic ceiling clamp
  });

  it("loaded materials carry the authored glTF factors verbatim", async () => {
    const authored = gltfJson(DUCK).materials ?? [];
    expect(authored.length).toBeGreaterThan(0);
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: `data:model/gltf-binary;base64,${readFileSync(DUCK).toString("base64")}`,
      assetId: "duck",
      assetName: "Duck",
      imageDecoder
    });
    const runtime = [...pipeline.resources.materialLibrary.values()];
    expect(runtime.length).toBe(authored.length);
    runtime.forEach((material, i) => {
      const spec = authored[i].pbrMetallicRoughness ?? {};
      const baseColor = material.getParameter("u_baseColorFactor") ?? material.getParameter("u_baseColor");
      expect(baseColor, `material ${i} baseColor`).toEqual(spec.baseColorFactor ?? [1, 1, 1, 1]);
      expect(material.getParameter("u_roughness") ?? material.getParameter("u_roughnessFactor"))
        .toBe(spec.roughnessFactor ?? 1);
      expect(material.getParameter("u_metallic") ?? material.getParameter("u_metallicFactor"))
        .toBe(spec.metallicFactor ?? 1);
      // No product-smoothing value survives on a loaded material.
      expect(material.getParameter("u_productColorSmoothing") ?? 0).toBe(0);
    });
    pipeline.dispose();
  });
});
