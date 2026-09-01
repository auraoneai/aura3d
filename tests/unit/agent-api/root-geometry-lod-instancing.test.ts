import { describe, expect, it } from "vitest";
import { createAuraText3DGeometry, defineAuraCustomGeometry, distanceLod, geometry, instances, material, selectAuraRootLodLevel, text3D } from "../../../packages/engine/src/agent-api";

describe("root geometry, instancing, text, and LOD", () => {
  it("validates custom indexed geometry and generates normals when the renderer consumes it", () => {
    const spec = defineAuraCustomGeometry({ positions: [[0, 1, 0], [-1, -1, 0], [1, -1, 0]], indices: [0, 1, 2] });
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(geometry.custom(spec).toJSON()).toMatchObject({ kind: "primitive", primitive: "custom", geometry: spec });
    expect(instances.custom(spec, {
      transforms: [{ position: [0, 0, 0] }, { position: [2, 0, 0] }],
      colors: ["#ffffff", "#ff0000"]
    }).toJSON()).toMatchObject({
      kind: "primitive",
      primitive: "custom",
      geometry: spec,
      instances: [{ position: [0, 0, 0] }, { position: [2, 0, 0] }],
      instanceColors: ["#ffffff", "#ff0000"]
    });
    expect(() => defineAuraCustomGeometry({ positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], indices: [0, 1, 4] })).toThrow(/outside/);
  });

  it("builds depth-bearing triangle glyphs rather than a label or overlay", () => {
    const built = createAuraText3DGeometry("A3D", { size: 1, depth: 0.2 });
    expect(built.method).toBe("extruded-bitmap-glyph-mesh");
    expect(built.glyphCount).toBe(3);
    expect(built.geometry.positions.length).toBeGreaterThan(500);
    expect(built.geometry.normals?.length).toBe(built.geometry.positions.length);
    expect(built.geometry.indices.length).toBeGreaterThan(700);
    expect(text3D("A3D").toJSON()).toMatchObject({ kind: "primitive", primitive: "custom", text3D: { text: "A3D", glyphCount: 3 } });
  });

  it("creates one root instanced node and rejects mismatched per-instance colors", () => {
    const node = instances.box({ transforms: [{ position: [0, 0, 0] }, { position: [1, 0, 0], scale: 0.5 }], colors: ["#ff0000", "#00ff00"], material: material.pbr() }).toJSON();
    expect(node.instances).toHaveLength(2);
    expect(node.instanceColors).toEqual(["#ff0000", "#00ff00"]);
    expect(() => instances.box({ transforms: [{ position: [0, 0, 0] }], colors: [] })).toThrow(/color count/);
  });

  it("holds distance LOD across the hysteresis band and switches outside it", () => {
    const levels = [{ maxDistance: 5 }, { maxDistance: 10 }, {}];
    expect(selectAuraRootLodLevel(4, levels).levelIndex).toBe(0);
    expect(selectAuraRootLodLevel(5.4, levels, 0, 0.5)).toMatchObject({ levelIndex: 0, reason: "hysteresis-hold" });
    expect(selectAuraRootLodLevel(5.6, levels, 0, 0.5)).toMatchObject({ levelIndex: 1, reason: "farther-threshold" });
    expect(selectAuraRootLodLevel(4.6, levels, 1, 0.5)).toMatchObject({ levelIndex: 1, reason: "hysteresis-hold" });
    expect(selectAuraRootLodLevel(4.4, levels, 1, 0.5)).toMatchObject({ levelIndex: 0, reason: "nearer-threshold" });
    expect(distanceLod({ levels: [{ name: "near", maxDistance: 5, primitive: "sphere" }, { name: "far", primitive: "box" }], hysteresis: 0.5 }).toJSON()).toMatchObject({ lod: { hysteresis: 0.5 }, primitive: "sphere" });
  });
});
