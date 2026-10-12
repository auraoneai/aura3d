/**
 * Q-15-2 / #545: "685 boxes → 1 upload". Under A3D_QR_CORE, identical builtin
 * primitives in one mount share one vertex + index buffer, so the device
 * creates 2 GPU buffers for 685 boxes instead of 1,370. Flag off: unchanged.
 */

import { describe, expect, it } from "vitest";
import { createProductionRuntimePrimitiveEntries } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { qrPrimitiveGeometryOptions, QrPrimitiveGeometryPool } from "../../../../packages/engine/src/agent-api/compiler/geometry";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode, AuraSceneNode } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { Geometry } from "@aura3d/rendering";

const CORE = resolveQrFlags({ options: ["core"] });
const OFF = resolveQrFlags({ options: ["-core"] });

function boxes(count: number): AuraSceneNode[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "primitive",
    primitive: "box",
    name: `box ${index}`,
    position: [index % 25, 0, Math.floor(index / 25)],
    size: [0.5 + (index % 3) * 0.25, 1, 0.5]
  }) as AuraPrimitiveNode);
}

/** Counts `createBuffer` calls the way the WebGL2 device would see them. */
function uploadAll(geometries: readonly Geometry[]): number {
  let created = 0;
  const device = {
    createBuffer: () => {
      created += 1;
      return { disposed: false, dispose() { this.disposed = true; } };
    },
    updateBuffer: () => undefined
  } as never;
  for (const geometry of geometries) {
    geometry.vertexBuffer.upload(device);
    geometry.indexBuffer?.upload(device);
  }
  return created;
}

const geometriesOf = (nodes: AuraSceneNode[], qr: ReturnType<typeof qrPrimitiveGeometryOptions>) =>
  createProductionRuntimePrimitiveEntries(nodes, qr).map((entry) => entry.resources[0]!.geometry);

describe("Q-15-2 shared primitive geometry (685 boxes → 1 upload)", () => {
  it("flag on: 685 boxes upload 2 GPU buffers (1 vertex + 1 index), each resource keeps its own handle", () => {
    const geometries = geometriesOf(boxes(685), qrPrimitiveGeometryOptions(CORE, undefined, {}));
    expect(new Set(geometries).size).toBe(685);
    expect(new Set(geometries.map((g) => g.vertexBuffer)).size).toBe(1);
    expect(uploadAll(geometries)).toBe(2);
  });

  it("flag off: legacy per-node geometry (685 boxes → 1,370 buffers), unchanged", () => {
    expect(qrPrimitiveGeometryOptions(OFF, undefined, {})).toBeUndefined();
    const geometries = geometriesOf(boxes(685), qrPrimitiveGeometryOptions(OFF, undefined, {}));
    expect(uploadAll(geometries)).toBe(1370);
  });

  it("different kinds and tiers do not share; capsules share only for an equal folded size", () => {
    const scope = {};
    const nodes = [
      { kind: "primitive", primitive: "box" },
      { kind: "primitive", primitive: "sphere" },
      { kind: "primitive", primitive: "sphere", size: [2, 2, 2] },
      { kind: "primitive", primitive: "capsule", size: [0.5, 2, 0.5] },
      { kind: "primitive", primitive: "capsule", size: [0.5, 2, 0.5] },
      { kind: "primitive", primitive: "capsule", size: [0.5, 3, 0.5] }
    ] as AuraSceneNode[];
    const geometries = geometriesOf(nodes, qrPrimitiveGeometryOptions(CORE, undefined, scope));
    // box, sphere (size is in the model matrix), capsule 0.5x2, capsule 0.5x3
    expect(new Set(geometries.map((g) => g.vertexBuffer)).size).toBe(4);
    const half = geometriesOf([nodes[1]!], qrPrimitiveGeometryOptions(CORE, { primitiveSegments: "half" }, scope));
    expect(half[0]!.vertexBuffer).not.toBe(geometries[1]!.vertexBuffer);
  });

  it("one pool per mount scope; no scope means no sharing", () => {
    const a = qrPrimitiveGeometryOptions(CORE, undefined, {});
    const b = qrPrimitiveGeometryOptions(CORE, undefined, {});
    expect(a!.pool).not.toBe(b!.pool);
    const scope = {};
    expect(qrPrimitiveGeometryOptions(CORE, undefined, scope)!.pool).toBe(qrPrimitiveGeometryOptions(CORE, undefined, scope)!.pool);
    expect(qrPrimitiveGeometryOptions(CORE)!.pool).toBeUndefined();
  });

  it("disposal is reference counted: the shared buffers die with the last handle", () => {
    const pool = new QrPrimitiveGeometryPool();
    const [first, second] = geometriesOf(boxes(2), { core: true, primitiveSegments: "full", pool });
    expect(pool.size).toBe(1);
    const sharedVb = first!.vertexBuffer;
    first!.dispose();
    first!.dispose(); // idempotent: releases only once
    expect(pool.size).toBe(1);
    expect(() => sharedVb.getAttribute(0, "position")).not.toThrow();
    second!.dispose();
    expect(pool.size).toBe(0);
    expect(() => sharedVb.getAttribute(0, "position")).toThrow();
  });
});
