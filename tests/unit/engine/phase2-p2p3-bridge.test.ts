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
    // Zero instances is valid (an empty pool this frame): it builds, and the compiler skips it with INSTANCES_EMPTY.
    expect(() => scene().add(instances.model(models.tree, { transforms: [] })).toJSON()).not.toThrow();
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
    // S5-WP04-01: every lobe is supported, so requested lobes carry no bound note.
    expect(coated.physicalWarnings).toBeUndefined();
  });

  it("stamps no bounded warning once every lobe is supported", () => {
    const iridescent = material.physical({ color: "#ffffff", iridescence: 0.8 });
    expect(iridescent.iridescence).toBe(0.8);
    expect(iridescent.physicalWarnings).toBeUndefined();
  });

  it("physical is not a pbr alias: the same params validate only through physical", () => {
    const viaPbr = material.pbr({ color: "#ffffff", clearcoat: 1 });
    expect(viaPbr.clearcoat).toBe(1);
    expect(viaPbr.physicalWarnings).toBeUndefined();
    const viaPhysical = material.physical({ color: "#ffffff", clearcoat: 1 });
    expect(viaPhysical.clearcoat).toBe(1);
    expect(() => material.pbr({ color: "#ffffff", clearcoat: 1, iridescenceIOR: 0.9 })).not.toThrow();
    expect(() => material.physical({ color: "#ffffff", clearcoat: 1, iridescenceIOR: 0.9 })).toThrow(/iridescenceIOR/);
  });

  it("M2 assets.ensureDecoders stays fail-closed when probes reject decoders", async () => {
    const diagnostics = await assets.ensureDecoders(
      { draco: true, meshopt: true },
      { dracoAvailable: false, meshoptAvailable: false, ktx2Available: false }
    );
    expect(diagnostics.draco.available).toBe(false);
    expect(diagnostics.meshopt.available).toBe(false);
    expect(diagnostics.ktx2.available).toBe(false);
  });
});
