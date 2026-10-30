import { describe, expect, it } from "vitest";
import { Material, PBRMaterial } from "../../../../packages/rendering/src";
import { applyMaterialOverrides, lowerModelMaterialOverrides, snapshotMaterials } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { parseAuraColor } from "../../../../packages/engine/src/contracts/sceneGraph";

// GU47 pass 4 (g09 FC47-M2, g14 CH47-08): sheen / sheenColor / sheenRoughness on model material overrides.
describe("model material override sheen (pass 4)", () => {
  it("writes the scaled sheen colour and roughness on materials that carry them, and restores on []", () => {
    const fabric = new Material({ name: "kit", shaderKey: "test", parameters: { u_sheenColorFactor: [0, 0, 0], u_sheenRoughnessFactor: 0 } as never });
    const glass = new Material({ name: "visor", shaderKey: "test", parameters: { u_baseColorFactor: [1, 1, 1, 1] } as never });
    const mats = [fabric, glass];
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, lowerModelMaterialOverrides(undefined, [{ sheen: 0.45, sheenRoughness: 1.4 }]));
    const got = fabric.getParameter("u_sheenColorFactor") as number[];
    expect([...got].map((v) => Number(v.toFixed(6)))).toEqual([0.45, 0.45, 0.45]);
    expect(fabric.getParameter("u_sheenRoughnessFactor")).toBe(1);
    expect(glass.getParameter("u_sheenColorFactor")).toBeUndefined();
    applyMaterialOverrides(snapshot, mats, lowerModelMaterialOverrides(undefined, [{ sheenColor: "#ff8040", sheen: 0.5 }]));
    const [r, g, b] = parseAuraColor("#ff8040");
    expect(fabric.getParameter("u_sheenColorFactor")).toEqual([r * 0.5, g * 0.5, b * 0.5]);
    applyMaterialOverrides(snapshot, mats, []);
    expect(fabric.getParameter("u_sheenColorFactor")).toEqual([0, 0, 0]);
  });

  it("finds the sheen parameters on the default PBR material", () => {
    const pbr = new PBRMaterial({ name: "felt" } as never);
    expect(pbr.getParameter("u_sheenColorFactor")).toBeDefined();
    expect(pbr.getParameter("u_sheenRoughnessFactor")).toBeDefined();
  });
});
