import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuraPrimitiveOptions } from "@aura3d/engine";
import { extrudeParityMesh, type ExtrudeParityParams } from "@aura3d/rendering";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createProductionPrimitiveGeometry, qrPrimitiveMeshFor } from "../../../packages/engine/src/agent-api/compiler/primitives";

type Params = NonNullable<AuraPrimitiveOptions["params"]>;

const shape = {
  shape: [[0, 0], [8, 0], [8, 6], [0, 6]],
  holes: [[[2, 2], [4, 2], [4, 4], [2, 4]]]
};

function scenePrimitive(params: Params) {
  const snapshot = scene().add(primitives.extrude({ name: "profile", params })).toJSON();
  const node = snapshot.nodes[0];
  if (!node || node.kind !== "primitive") throw new Error("Expected an extruded primitive in the scene.");
  return node;
}

function sceneMesh(params: Params) {
  const node = scenePrimitive(params);
  const mesh = qrPrimitiveMeshFor(node, { core: true, primitiveSegments: "full" });
  if (!mesh) throw new Error("Expected the primitive geometry route to return a mesh.");
  return mesh;
}

describe("linear extrusion through typed scenes", () => {
  it("retains a holed shape, depth, and steps through both geometry routes", () => {
    expectTypeOf<Params["extrusionMode"]>().toEqualTypeOf<"linear" | undefined>();
    const params: Params = { shape, extrusionMode: "linear", depth: 3, steps: 2 };
    const node = scenePrimitive(params);
    expect(node.params).toEqual(params);

    const mesh = sceneMesh(params);
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [8, 6, 3] });
    expect(mesh.groups).toEqual([
      { start: 0, count: 48, materialIndex: 0 },
      { start: 48, count: 96, materialIndex: 1 }
    ]);
    const profilePoints = new Set([...shape.shape, ...shape.holes[0]!].map((point) => point.join(",")));
    const levels = new Set<number>();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(profilePoints.has(`${mesh.positions[i]},${mesh.positions[i + 1]}`)).toBe(true);
      levels.add(mesh.positions[i + 2]!);
    }
    expect([...levels].sort((a, b) => a - b)).toEqual([0, 1.5, 3]);
    let endCapArea = 0;
    for (let i = 0; i < mesh.groups![0]!.count; i += 3) {
      const offsets = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
      if (!offsets.every((offset) => mesh.positions[offset + 2] === 3)) continue;
      const [a, b, c] = offsets as [number, number, number];
      endCapArea += Math.abs(
        (mesh.positions[b]! - mesh.positions[a]!) * (mesh.positions[c + 1]! - mesh.positions[a + 1]!) -
        (mesh.positions[b + 1]! - mesh.positions[a + 1]!) * (mesh.positions[c]! - mesh.positions[a]!)
      ) / 2;
    }
    expect(endCapArea).toBe(44);

    // The flag-off production route uses the same authored primitive parameters.
    const geometry = createProductionPrimitiveGeometry(node);
    try {
      expect(geometry.bounds).toEqual(mesh.bounds);
      expect(geometry.groups).toEqual(mesh.groups);
      expect(geometry.vertexBuffer.vertexCount).toBe(mesh.positions.length / 3);
      for (let i = 0; i < geometry.vertexBuffer.vertexCount; i += 1) {
        expect(geometry.vertexBuffer.getAttribute(i, "position")).toEqual(Array.from(mesh.positions.slice(i * 3, i * 3 + 3)));
      }
    } finally {
      geometry.dispose();
    }
  });

  it("allows an explicit bevelEnabled: false and rejects incompatible authored settings", () => {
    const base: Params = { shape, extrusionMode: "linear", depth: 2 };
    expect(sceneMesh({ ...base, bevelEnabled: false }).positions).toEqual(sceneMesh(base).positions);

    const incompatible: readonly Params[] = [
      { bevelEnabled: true },
      { bevelThickness: 0 },
      { bevelSize: 0 },
      { bevelOffset: 0 },
      { bevelSegments: 0 },
      { path: [[0, 0, 0], [0, 0, 1]] },
      { extrudePath: [[0, 0, 0], [0, 0, 1]] }
    ];
    for (const settings of incompatible) {
      const node = scenePrimitive({ ...base, ...settings });
      expect(() => qrPrimitiveMeshFor(node, { core: true })).toThrow(/path|bevel/i);
      expect(() => createProductionPrimitiveGeometry(node)).toThrow(/path|bevel/i);
    }
  });

  it("rejects every authored bevelEnabled value other than false in both APIs", () => {
    const base = { shape, extrusionMode: "linear" } as const;
    expect(extrudeParityMesh({ ...base, bevelEnabled: false }).positions).toEqual(extrudeParityMesh(base).positions);
    for (const bevelEnabled of [true, null, "false", 0]) {
      const params = { ...base, bevelEnabled } as unknown as ExtrudeParityParams;
      expect(() => extrudeParityMesh(params)).toThrow(/bevel/i);
      expect(() => sceneMesh(params)).toThrow(/bevel/i);
    }
  });

  it("rejects unknown modes and passes invalid linear steps to the generator for validation", () => {
    for (const extrusionMode of ["sweep", null, false, 1]) {
      const params = { shape, extrusionMode } as unknown as Params;
      expect(() => sceneMesh(params)).toThrow(/unsupported extrusion mode/i);
    }
    for (const steps of [0, -1, 1.5, Infinity]) {
      expect(() => sceneMesh({ shape, extrusionMode: "linear", steps })).toThrow(RangeError);
    }
  });

  it("keeps the existing bevel defaults and explicit path sweep when mode is omitted", () => {
    const defaultMesh = sceneMesh({ shape });
    const explicitDefaults = sceneMesh({ shape, steps: 1, depth: 1, bevelEnabled: true, bevelSegments: 3 });
    expect(defaultMesh.positions).toEqual(explicitDefaults.positions);
    expect(defaultMesh.bounds.min[2]).toBeCloseTo(-0.2);
    expect(defaultMesh.bounds.max[2]).toBeCloseTo(1.2);

    const path = { getPoint: (t: number) => ({ x: 0, y: 0, z: t * 3 }) };
    const swept = sceneMesh({ shape, steps: 2, extrudePath: path, bevelEnabled: false });
    expect(swept.bounds.min[2]).toBeCloseTo(0);
    expect(swept.bounds.max[2]).toBeCloseTo(3);
  });
});
