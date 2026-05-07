import { describe, expect, it } from "vitest";
import { Material, MaterialPresetRegistry, PBRMaterial, UnlitMaterial } from "@galileo3d/rendering";

describe("MaterialPresetRegistry", () => {
  it("creates built-in unlit and pbr materials with validated options", () => {
    const registry = new MaterialPresetRegistry();

    const unlit = registry.create("unlit", { color: [0.2, 0.4, 0.8, 1] });
    const pbr = registry.create("pbr", { baseColor: [0.8, 0.6, 0.3, 1], metallic: 0.5, roughness: 0.25 });

    expect(unlit).toBeInstanceOf(UnlitMaterial);
    expect(unlit.getParameter("u_baseColor")).toEqual([0.2, 0.4, 0.8, 1]);
    expect(pbr).toBeInstanceOf(PBRMaterial);
    expect(pbr.getParameter("u_metallic")).toBe(0.5);
    expect(pbr.getParameter("u_roughness")).toBe(0.25);
  });

  it("supports custom material extension factories and rejects duplicate kinds", () => {
    const registry = new MaterialPresetRegistry([]);
    registry.register({
      kind: "custom-grid",
      description: "Test custom material extension",
      create: (options = {}) =>
        new Material({
          shaderKey: "custom/grid",
          parameters: {
            u_spacing: typeof options.spacing === "number" ? options.spacing : 1
          }
        })
    });

    expect(registry.has("custom-grid")).toBe(true);
    expect(registry.list().map((preset) => preset.kind)).toEqual(["custom-grid"]);
    expect(registry.create("custom-grid", { spacing: 4 }).getParameter("u_spacing")).toBe(4);
    expect(() =>
      registry.register({
        kind: "custom-grid",
        create: () => new Material({ shaderKey: "duplicate" })
      })
    ).toThrow(/already exists/);
    expect(() => registry.create("missing")).toThrow(/Unknown material preset/);
  });
});
