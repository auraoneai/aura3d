/**
 * Q-15-2 (C-07, PRD-01 §15 Phase 1) — engine primitives under A3D_QR_CORE come
 * from @aura3d/rendering `createPrimitiveGeometry`. Flag off: the legacy
 * generators, byte-identical.
 */

import { describe, expect, it } from "vitest";
import { createPrimitiveGeometry } from "@aura3d/rendering";
import type { Geometry } from "@aura3d/rendering";

import {
  createProductionPrimitiveGeometry,
  createProductionPrimitiveResources,
  createProductionRuntimePrimitiveEntries,
  qrPrimitiveMeshFor
} from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { qrPrimitiveGeometryOptions } from "../../../../packages/engine/src/agent-api/compiler/geometry";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode, AuraSceneNode, AuraVec3 } from "../../../../packages/engine/src/agent-api/nodes/types";

const PRIMITIVES = ["box", "sphere", "plane", "cylinder", "capsule", "torus"] as const;
const CORE = { core: true, primitiveSegments: "full" } as const;

function node(primitive: (typeof PRIMITIVES)[number], extra: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode {
  return { kind: "primitive", primitive, ...extra } as AuraPrimitiveNode;
}

function semantics(geometry: Geometry): string[] {
  return geometry.vertexBuffer.format.attributes.map((attribute) => attribute.semantic);
}

function vertexFloats(geometry: Geometry): number[] {
  return Array.from(geometry.vertexBuffer.floats);
}

function attr(geometry: Geometry, index: number, semantic: "position" | "normal"): AuraVec3 {
  const v = geometry.vertexBuffer.getAttribute(index, semantic);
  return [v[0]!, v[1]!, v[2]!];
}

describe("Q-15-2 flag off: legacy primitives unchanged", () => {
  it("qrPrimitiveGeometryOptions is undefined without A3D_QR_CORE", () => {
    expect(qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["-core"] }))).toBeUndefined();
    expect(qrPrimitiveGeometryOptions(undefined)).toBeUndefined();
    expect(qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["core"] }), { primitiveSegments: "half" })).toEqual({ core: true, primitiveSegments: "half" });
  });

  it("entries built with and without the (undefined) option are byte-identical to the legacy geometry", () => {
    const nodes: AuraSceneNode[] = PRIMITIVES.map((primitive) => node(primitive, { size: [1, 2, 3] }));
    const legacy = createProductionRuntimePrimitiveEntries(nodes);
    const off = createProductionRuntimePrimitiveEntries(nodes, qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["-core"] })));
    expect(off).toHaveLength(PRIMITIVES.length);
    off.forEach((entry, index) => {
      const a = legacy[index]!.resources[0]!;
      const b = entry.resources[0]!;
      expect(vertexFloats(b.geometry)).toEqual(vertexFloats(a.geometry));
      expect(Array.from(b.geometry.indexBuffer!.data)).toEqual(Array.from(a.geometry.indexBuffer!.data));
      expect(b.bounds).toEqual(a.bounds);
      expect(vertexFloats(b.geometry)).toEqual(vertexFloats(createProductionPrimitiveGeometry(nodes[index] as AuraPrimitiveNode)));
    });
  });

  it("custom/geometry-spec nodes never take the flag-on path", () => {
    const custom = { kind: "primitive", primitive: "custom", geometry: { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], indices: [0, 1, 2] } } as unknown as AuraPrimitiveNode;
    expect(qrPrimitiveMeshFor(custom, CORE)).toBeUndefined();
    expect(qrPrimitiveMeshFor(node("box"), undefined)).toBeUndefined();
  });
});

describe("Q-15-2 flag on: @aura3d/rendering createPrimitiveGeometry", () => {
  it("every primitive uses the rendering factory's tessellation (vertex/index counts)", () => {
    for (const primitive of PRIMITIVES) {
      const [resource] = createProductionPrimitiveResources(node(primitive), CORE);
      const source = createPrimitiveGeometry(primitive, undefined, { primitiveSegments: "full" }, primitive === "capsule" ? [1, 1, 1] : undefined);
      expect(resource!.geometry.vertexBuffer.vertexCount, primitive).toBe(source.vertexBuffer.vertexCount);
      expect(resource!.geometry.indexBuffer!.data.length, primitive).toBe(source.indexBuffer!.data.length);
    }
    // three.js-class defaults: sphere 64×32 (legacy was 16×12).
    const [sphere] = createProductionPrimitiveResources(node("sphere"), CORE);
    expect(sphere!.geometry.vertexBuffer.vertexCount).toBe(65 * 33);
  });

  it("C-27 tier halving reaches the engine (primitiveSegments: \"half\")", () => {
    const [full] = createProductionPrimitiveResources(node("sphere"), CORE);
    const [half] = createProductionPrimitiveResources(node("sphere"), { core: true, primitiveSegments: "half" });
    expect(half!.geometry.vertexBuffer.vertexCount).toBe(33 * 17);
    expect(half!.geometry.vertexBuffer.vertexCount).toBeLessThan(full!.geometry.vertexBuffer.vertexCount);
  });

  it("textured primitives keep the engine's uv + uv1 + tangent layout", () => {
    for (const primitive of ["box", "sphere", "plane", "cylinder", "capsule"] as const) {
      const [resource] = createProductionPrimitiveResources(node(primitive), CORE);
      expect(semantics(resource!.geometry), primitive).toEqual(expect.arrayContaining(["position", "normal", "tangent", "uv", "uv1"]));
    }
  });

  it("unit primitives keep the legacy unit bounds (size comes from the model matrix)", () => {
    for (const primitive of ["box", "sphere", "cylinder"] as const) {
      const [resource] = createProductionPrimitiveResources(node(primitive), CORE);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(resource!.bounds.min[axis]).toBeCloseTo(-0.5, 5);
        expect(resource!.bounds.max[axis]).toBeCloseTo(0.5, 5);
      }
    }
  });

  it("winding agrees with the vertex normals (back-face culling keeps the outside)", () => {
    for (const primitive of PRIMITIVES) {
      const [resource] = createProductionPrimitiveResources(node(primitive, { size: [0.5, 2, 0.5] }), CORE);
      const geometry = resource!.geometry;
      const indices = geometry.indexBuffer!.data;
      let disagree = 0;
      for (let t = 0; t < indices.length; t += 3) {
        const a = attr(geometry, indices[t]!, "position");
        const b = attr(geometry, indices[t + 1]!, "position");
        const c = attr(geometry, indices[t + 2]!, "position");
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const g = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
        if (Math.hypot(g[0]!, g[1]!, g[2]!) < 1e-12) continue; // degenerate pole triangles
        const n = attr(geometry, indices[t]!, "normal");
        if (g[0]! * n[0] + g[1]! * n[1] + g[2]! * n[2] < 0) disagree += 1;
      }
      expect(disagree, primitive).toBe(0);
    }
  });

  it("sphere normals are radial and unit length", () => {
    const [resource] = createProductionPrimitiveResources(node("sphere"), CORE);
    const geometry = resource!.geometry;
    for (let i = 0; i < geometry.vertexBuffer.vertexCount; i += 37) {
      const p = attr(geometry, i, "position");
      const n = attr(geometry, i, "normal");
      expect(Math.hypot(...n)).toBeCloseTo(1, 5);
      expect(Math.hypot(...p)).toBeCloseTo(0.5, 5);
      for (let axis = 0; axis < 3; axis += 1) expect(n[axis]).toBeCloseTo(p[axis]! / 0.5, 4);
    }
  });

  it("cylinder caps have flat ±Y normals (split from the side normals)", () => {
    const [resource] = createProductionPrimitiveResources(node("cylinder"), CORE);
    const geometry = resource!.geometry;
    let capUp = 0;
    let capDown = 0;
    let sides = 0;
    for (let i = 0; i < geometry.vertexBuffer.vertexCount; i += 1) {
      const n = attr(geometry, i, "normal");
      if (Math.abs(n[1] - 1) < 1e-6) capUp += 1;
      else if (Math.abs(n[1] + 1) < 1e-6) capDown += 1;
      else if (Math.abs(n[1]) < 1e-6) sides += 1;
    }
    expect(capUp).toBeGreaterThan(0);
    expect(capDown).toBeGreaterThan(0);
    expect(sides).toBeGreaterThan(0);
    expect(capUp + capDown + sides).toBe(geometry.vertexBuffer.vertexCount);
  });

  it("capsule: after the model matrix S(size), caps are hemispheres and normals are radial", () => {
    const size: AuraVec3 = [0.5, 2, 0.5];
    const [resource] = createProductionPrimitiveResources(node("capsule", { size }), CORE);
    const geometry = resource!.geometry;
    const radius = 0.25;
    const capCenterY = 1 - radius;
    let capVertices = 0;
    for (let i = 0; i < geometry.vertexBuffer.vertexCount; i += 1) {
      const p = attr(geometry, i, "position");
      const n = attr(geometry, i, "normal");
      const world: AuraVec3 = [p[0] * size[0], p[1] * size[1], p[2] * size[2]];
      // renderer normal matrix for S(size) = inverse transpose = S(1/size)
      const wn: AuraVec3 = [n[0] / size[0], n[1] / size[1], n[2] / size[2]];
      const wl = Math.hypot(...wn);
      if (world[1] > capCenterY + 1e-4) {
        capVertices += 1;
        const d: AuraVec3 = [world[0], world[1] - capCenterY, world[2]];
        expect(Math.hypot(...d)).toBeCloseTo(radius, 4);
        for (let axis = 0; axis < 3; axis += 1) expect(wn[axis]! / wl).toBeCloseTo(d[axis]! / radius, 3);
      }
      expect(Math.hypot(world[0], world[2])).toBeLessThanOrEqual(radius + 1e-5);
    }
    expect(capVertices).toBeGreaterThan(0);
  });
});
