/**
 * PRD-01 Phase-1 C-06 real-implementation tests (lane 01). Spec:
 * PRD-01 §15 Phase-1 items (a)–(f).
 *
 * (a) rotated parent [0, π/2, 0] with child at [1,0,0] gives world [0,0,−1]
 * (b) parent scale 6 with child at [1,0,0] gives [6,0,0]
 * (c) translation-only groups identical to the PR 0a stub
 * (d) a three-level nest matches independent elementary matrix multiplication
 * (e) shear flags SCENE_GRAPH_SHEAR
 * (f) "ZYX" default reproduces legacy rotationXYZ for 100 random Eulers
 * (g) 1,000-node static scene: 1,000 composes on frame 1, 0 on frame 2
 */

import { describe, expect, it } from "vitest";

import * as stub from "../../../../packages/engine/src/contracts/sceneGraph";
import {
  SCENE_GRAPH_SHEAR,
  composeWorldMatrix,
  composeWorldMatrixWithLookAt,
  createModelMatrixCache,
  createWorldMatrixCache,
  decomposeMatrix,
  eulerToQuaternion,
  lookAtWorldQuaternion
} from "../../../../packages/engine/src/agent-api/sceneGraph";
import { createModelMatrix } from "../../../../packages/engine/src/agent-api/index";
import type { AuraPrimitiveNode } from "../../../../packages/engine/src/agent-api/index";

// Independent row-by-column oracle, retaining column-major storage.
function product(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4;
    const col = Math.floor(i / 4);
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
    return sum;
  });
}

function rotationByOrder(rotation: readonly [number, number, number], order: string): number[] {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const axes: Record<string, number[]> = {
    X: [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1],
    Y: [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1],
    Z: [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  };
  return product(product(axes[order[0]!]!, axes[order[1]!]!), axes[order[2]!]!);
}

/** Legacy rotationXYZ: Rz·Ry·Rx (column-major). */
function rotationXYZ(rotation: readonly [number, number, number]): number[] {
  return rotationByOrder(rotation, "ZYX");
}

function quatToMatrix(q: readonly [number, number, number, number]): Float32Array {
  const m = new Float32Array(16);
  const out = composeWorldMatrix(null, { quaternion: q }, m);
  return out;
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, eps = 1e-6): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(Math.abs((actual[i] ?? 0) - (expected[i] ?? 0))).toBeLessThan(eps);
  }
}

function point(matrix: ArrayLike<number>, position: readonly [number, number, number]): number[] {
  const [x, y, z] = position;
  return [0, 1, 2].map((row) => matrix[row]! * x + matrix[4 + row]! * y + matrix[8 + row]! * z + matrix[12 + row]!);
}

describe("prd01 C-06 composeWorldMatrix", () => {
  it("(a) rotated parent [0,π/2,0] + child at [1,0,0] gives world [0,0,−1]", () => {
    const parent = composeWorldMatrix(null, { rotation: [0, Math.PI / 2, 0] }, new Float32Array(16));
    const world = composeWorldMatrix(parent, { position: [1, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [0, 0, -1], 1e-6);
  });

  it("(b) parent scale 6 + child at [1,0,0] gives world [6,0,0]", () => {
    const parent = composeWorldMatrix(null, { scale: 6 }, new Float32Array(16));
    const world = composeWorldMatrix(parent, { position: [1, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [6, 0, 0], 1e-6);
  });

  it("(c) translation-only groups match the PR 0a stub", () => {
    const parent = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, -2, 9, 1]);
    const local = { position: [3, -1, 0.5] as const };
    const real = composeWorldMatrix(parent, local, new Float32Array(16));
    const stubM = stub.composeWorldMatrix(parent, local as never, new Float32Array(16));
    expectClose(real, stubM, 1e-7);
  });

  it("contract accepts a local pivot and leaves that point fixed under rotation and scale", () => {
    const identity = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const result = stub.composeWorldMatrix(identity, { pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] }, new Float32Array(16));
    expectClose([result[12]!, result[13]!, result[14]!], [1, -2, 0]);
    expectClose([result[0]! + result[12]!, result[1]! + result[13]!, result[2]! + result[14]!], [1, 0, 0]);
  });

  it("root composition applies pivot before parent transforms and defaults to the origin", () => {
    const parent = composeWorldMatrix(null, { position: [10, 0, 0] }, new Float32Array(16));
    const spec = { position: [3, 4, 0] as const, pivot: [1, 0, 0] as const, rotation: [0, 0, Math.PI / 2] as const, scale: [2, 1, 1] as const };
    const result = composeWorldMatrix(parent, spec, new Float32Array(16));
    expectClose(point(result, [1, 0, 0]), [14, 4, 0]);
    expectClose(point(result, [2, 0, 0]), [14, 6, 0]);
    const implicit = composeWorldMatrix(parent, { ...spec, pivot: undefined }, new Float32Array(16));
    const explicit = composeWorldMatrix(parent, { ...spec, pivot: [0, 0, 0] }, new Float32Array(16));
    expectClose(implicit, explicit);
  });

  it("invalidates cached world matrices when a pivot changes in place", () => {
    const cache = createWorldMatrixCache();
    const spec = { rotation: [0, 0, Math.PI / 2] as const, scale: [2, 1, 1] as const, pivot: [1, 0, 0] as [number, number, number] };
    const result = new Float32Array(16);
    cache.beginFrame();
    cache.world(spec, null, result);
    expectClose(point(result, [0, 0, 0]), [1, -2, 0]);
    expect(cache.composed).toBe(1);
    cache.beginFrame();
    cache.world(spec, null, result);
    expect(cache.composed).toBe(0);
    spec.pivot[0] = 2;
    cache.world(spec, null, result);
    expect(cache.composed).toBe(1);
    expectClose(point(result, [0, 0, 0]), [2, -4, 0]);
  });

  it("lookAt aims from the translated pivot and keeps the pivot fixed", () => {
    const result = composeWorldMatrixWithLookAt(null, {
      position: [3, 4, 0], pivot: [1, 0, 0], scale: [2, 1, 1], lookAt: [4, 4, -1]
    }, new Float32Array(16));
    expectClose(point(result, [1, 0, 0]), [4, 4, 0]);
    expectClose(point(result, [2, 0, 0]), [6, 4, 0]);
    expectClose([result[8]!, result[9]!, result[10]!], [0, 0, 1]);
  });

  it("(d) three-level nest matches elementary matrix composition", () => {
    const specs = [
      { position: [1, 2, -3] as const, rotation: [0.3, -0.7, 0.9] as const, scale: [2, 1, 0.5] as const },
      { position: [-1, 0.5, 2] as const, rotation: [-1.1, 0.4, 0.2] as const, scale: [0.5, 3, 1] as const },
      { position: [0.25, -4, 1] as const, rotation: [0.9, 0.9, -1.3] as const, scale: [1, 1, 4] as const }
    ];
    let world = composeWorldMatrix(null, specs[0], new Float32Array(16));
    world = composeWorldMatrix(world, specs[1], new Float32Array(16));
    world = composeWorldMatrix(world, specs[2], new Float32Array(16));
    const local = specs.map(({ position: [x, y, z], rotation, scale: [sx, sy, sz] }) => product(
      product([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], rotationByOrder(rotation, "ZYX")),
      [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]
    ));
    expectClose(world, product(product(local[0]!, local[1]!), local[2]!), 1e-5);
  });

  it("(d') every Euler order matches elementary axis rotations", () => {
    const orders = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"] as const;
    const eulers = [
      [0.3, -0.7, 0.9],
      [-1.1, 0.4, 0.2],
      [1.57, -2.2, 0.05],
      [0.01, 0.02, 3.1]
    ] as const;
    for (const order of orders) {
      for (const e of eulers) {
        const q = eulerToQuaternion(e, order);
        expectClose(quatToMatrix(q), rotationByOrder(e, order), 1e-6);
      }
    }
  });

  it("(e) decomposeMatrix reports shear for non-orthogonal bases", () => {
    // Shear: column 0 = (1,0,0), column 1 = (1,1,0) — not orthogonal.
    const m = Float32Array.from([1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);
    const d = decomposeMatrix(m);
    expect(d.sheared).toBe(true);
    expect(d.position).toEqual([5, 6, 7]);
    expect(SCENE_GRAPH_SHEAR).toBe("SCENE_GRAPH_SHEAR");
    const clean = composeWorldMatrix(null, { rotation: [0.5, -0.2, 1.1], scale: [2, 3, 1] }, new Float32Array(16));
    expect(decomposeMatrix(clean).sheared).toBe(false);
  });

  it("(f) \"ZYX\" default reproduces legacy rotationXYZ for 100 random Eulers", () => {
    let seed = 0x9e3779b9;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * Math.PI * 4 - Math.PI * 2;
    };
    for (let i = 0; i < 100; i += 1) {
      const euler: [number, number, number] = [rand(), rand(), rand()];
      const legacy = rotationXYZ(euler);
      const real = quatToMatrix(eulerToQuaternion(euler));
      expectClose(Array.from(real), Array.from(legacy), 1e-6);
    }
  });

  it("(g) 1,000-node static scene: 1,000 composes frame 1, 0 on frame 2", () => {
    const cache = createWorldMatrixCache();
    const nodes = Array.from({ length: 1000 }, (_, i) => ({
      position: [i % 10, i % 7, i % 5] as const,
      rotation: [0, (i % 8) * 0.1, 0] as const
    }));
    const parent = composeWorldMatrix(null, { position: [1, 0, 0] }, new Float32Array(16));
    const out = new Float32Array(16);
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(1000);
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(0);
    // Mutating one node recomposes only that node.
    nodes[0]!.position = [9, 9, 9];
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(1);
    expect([out[12], out[13], out[14]]).not.toEqual([1, 0, 0]);
  });

  describe("Phase-6 static model-matrix cache (compiler seam)", () => {
    const unitBounds = { min: [-0.5, -0.5, -0.5] as const, max: [0.5, 0.5, 0.5] as const };

    it("composes once per static node and returns the retained matrix", () => {
      const cache = createModelMatrixCache();
      const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [1, 2, 3], scale: [0.5, 0.5, 0.5] };
      cache.beginFrame();
      const first = cache.modelMatrix(node, unitBounds, false, 0);
      const second = cache.modelMatrix(node, unitBounds, false, 0);
      expect(cache.composed).toBe(1);
      expect(cache.hits).toBe(1);
      expect(second).toBe(first); // retained array, not a copy
      expectClose(Array.from(first), Array.from(createModelMatrix(node, unitBounds, false, 0)), 1e-6);
    });

    it("recomposes when a fingerprinted field mutates in place", () => {
      const cache = createModelMatrixCache();
      const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [0, 0, 0] };
      cache.modelMatrix(node, unitBounds, false, 0);
      Object.assign(node, { position: [4, 0, 0] });
      const moved = cache.modelMatrix(node, unitBounds, false, 0);
      expect(cache.composed).toBe(2);
      expectClose(Array.from(moved), Array.from(createModelMatrix(node, unitBounds, false, 0)), 1e-6);
      // normalizeToUnit and bounds are fingerprint inputs too.
      cache.modelMatrix(node, unitBounds, true, 0);
      expect(cache.composed).toBe(3);
    });

    it("bypasses animated nodes entirely (time-varying TRS stays live)", () => {
      const cache = createModelMatrixCache();
      const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [0, 0, 0], animation: { clip: "float" } };
      cache.beginFrame();
      const a = cache.modelMatrix(node, unitBounds, false, 0);
      const b = cache.modelMatrix(node, unitBounds, false, 1);
      expect(cache.composed).toBe(0);
      expect(cache.hits).toBe(0);
      expect(a).not.toBe(b); // fresh arrays — the animated path never retains
      expectClose(Array.from(a), Array.from(createModelMatrix(node, unitBounds, false, 0)), 1e-6);
    });

    it("keeps distinct nodes isolated (WeakMap identity keying)", () => {
      const cache = createModelMatrixCache();
      const a: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [0, 0, 0] };
      const b: AuraPrimitiveNode = { kind: "primitive", primitive: "box", position: [0, 0, 0] };
      cache.modelMatrix(a, unitBounds, false, 0);
      cache.modelMatrix(b, unitBounds, false, 0);
      cache.modelMatrix(a, unitBounds, false, 0);
      expect(cache.composed).toBe(2);
      expect(cache.hits).toBe(1);
    });
  });

  it("lookAt orients -Z toward the target in world space", () => {
    // Eye at origin looking down -Z: identity rotation.
    const q0 = lookAtWorldQuaternion([0, 0, 0], [0, 0, -1]);
    const m0 = quatToMatrix(q0);
    // Identity columns.
    expectClose([m0[0]!, m0[1]!, m0[2]!], [1, 0, 0], 1e-6);
    expectClose([m0[4]!, m0[5]!, m0[6]!], [0, 1, 0], 1e-6);
    expectClose([m0[8]!, m0[9]!, m0[10]!], [0, 0, 1], 1e-6);
    // Eye at origin looking at +X: forward column (−Z basis) becomes +X.
    const qx = lookAtWorldQuaternion([0, 0, 0], [1, 0, 0]);
    const mx = quatToMatrix(qx);
    expectClose([mx[8]!, mx[9]!, mx[10]!], [-1, 0, 0], 1e-6);
    // composeWorldMatrixWithLookAt places the node and faces the target.
    const world = composeWorldMatrixWithLookAt(null, { position: [0, 0, 5], lookAt: [0, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [0, 0, 5], 1e-6);
  });
});
