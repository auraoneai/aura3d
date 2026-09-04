import { describe, expect, it } from "vitest";
import {
  assets,
  instances,
  material,
  scene
} from "../../../packages/engine/src/agent-api/index";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/index";

const models = defineAuraAssets({
  tree: { type: "model", format: "glb", url: "https://cdn.aura3d.test/models/tree.glb" }
});

describe("P2 instances.model root builder", () => {
  it("records instances, colors, and LOD on the model node", () => {
    const snapshot = scene()
      .add(instances.model(models.tree, {
        transforms: [{ position: [0, 0, 0] }, { position: [3, 0, 0], scale: 2 }],
        colors: ["#ffffff", "#88ff88"],
        lod: { levels: [{ maxDistance: 20 }, { maxDistance: 60 }], hysteresis: 2 }
      }))
      .toJSON();
    const node = snapshot.nodes.find((entry) => entry.kind === "model");
    expect(node).toMatchObject({ instances: [{ position: [0, 0, 0] }, { position: [3, 0, 0], scale: 2 }] });
    expect(node).toMatchObject({ instanceColors: ["#ffffff", "#88ff88"] });
    expect(node).toMatchObject({ instanceLod: { levels: [{ maxDistance: 20 }, { maxDistance: 60 }], hysteresis: 2 } });
    // P2 diagnostics surfacing: culling telemetry rides the root node.
    expect(node).toMatchObject({ instanceCulling: { instanceCount: 2, cullable: true } });
    expect((node as { instanceCulling?: { boundingRadius?: number } }).instanceCulling?.boundingRadius).toBeGreaterThan(0);
    expect(node).not.toHaveProperty("instancedModelWarning");
  });

  it("stamps the D1 fallback diagnostic for explicitly unaware materials and fails loud on bad input", () => {
    const snapshot = scene()
      .add(instances.model(models.tree, { transforms: [{ position: [0, 0, 0] }], instancingAware: false }))
      .toJSON();
    const node = snapshot.nodes.find((entry) => entry.kind === "model") as { instancedModelWarning?: string } | undefined;
    expect(node?.instancedModelWarning).toContain("material-rejects-instancing");
    expect(() => scene().add(instances.model(models.tree, { transforms: [] })).toJSON()).toThrow(
      "at least one transform"
    );
    expect(() =>
      scene().add(instances.model(models.tree, {
        transforms: [{ position: [0, 0, 0] }],
        colors: ["#ffffff", "#000000"]
      })).toJSON()
    ).toThrow("must match transform count");
  });
});

describe("P3 material.physical root builder", () => {
  it("merges only explicitly requested extension params (no false clearcoat trigger)", () => {
    const plain = material.physical({ color: "#ffffff", roughness: 0.4 });
    expect(plain.clearcoat).toBeUndefined();
    expect(plain.transmission).toBeUndefined();
    expect(plain.physicalWarnings).toBeUndefined();
    const coated = material.physical({ color: "#ffffff", clearcoat: 1, clearcoatRoughness: 0.1 });
    expect(coated.clearcoat).toBe(1);
    expect(coated.clearcoatRoughness).toBe(0.1);
    // Requested extensions carry their bound notes; unrequested ones stay silent.
    expect(coated.physicalWarnings?.join(" ")).toContain("clearcoat");
    expect(coated.physicalWarnings?.join(" ")).not.toContain("iridescence");
  });

  it("stamps bounded warnings for non-supported extensions", () => {
    const iridescent = material.physical({ color: "#ffffff", iridescence: 0.8 });
    expect(iridescent.iridescence).toBe(0.8);
    expect(iridescent.physicalWarnings?.join(" ")).toContain("iridescence");
  });

  it("physical is not a pbr alias: the same params warn only through physical", () => {
    const viaPbr = material.pbr({ color: "#ffffff", clearcoat: 1 });
    expect(viaPbr.clearcoat).toBe(1);
    expect(viaPbr.physicalWarnings).toBeUndefined();
    const viaPhysical = material.physical({ color: "#ffffff", clearcoat: 1 });
    expect(viaPhysical.clearcoat).toBe(1);
    expect(viaPhysical.physicalWarnings?.join(" ")).toContain("clearcoat");
  });

  it("M2 assets.ensureDecoders stays fail-closed for unprobed decoders", async () => {
    const diagnostics = await assets.ensureDecoders({ draco: true, meshopt: true });
    expect(diagnostics.draco.available).toBe(false);
    expect(diagnostics.meshopt.available).toBe(false);
  });
});
